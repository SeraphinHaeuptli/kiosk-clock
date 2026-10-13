/*
 * A light switch on the home screen.
 *
 * The point of it is that the app is not open: tapping + on the home screen
 * has to reach a lamp without the clock, React Native or any JavaScript being
 * alive. So everything here works from shared preferences and the connection
 * registry, and never from the app's own state.
 *
 * Why stepping rather than a slider: RemoteViews — the only thing a widget may
 * draw with — has no slider in it, on any Android version. Four targets in one
 * row is what fits: dimmer, the level, brighter, and a switch.
 *
 * What Android allows here, since it is not obvious:
 *
 *   - A broadcast receiver may run for about ten seconds before the system
 *     calls it unresponsive. `goAsync` moves the work off the main thread and
 *     holds the process up meanwhile, which is the documented way to do a
 *     short job in response to a widget tap.
 *   - Connecting over Bluetooth from the background is not restricted — only
 *     starting services and activities is. The connection dies with the
 *     process, which is exactly why the work happens before `finish()`.
 */

package expo.modules.hueble

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.widget.RemoteViews

/** One step of the dimmer, as a share of the whole range. */
private const val STEP = 0.1

/**
 * How long to hold the process open after a tap, so the write has somewhere to
 * happen. Comfortably inside the ten seconds a receiver is allowed, and long
 * enough for a connect and a write to an already-bonded lamp.
 */
private const val SETTLE_MS = 3_000L

private const val ACTION_STEP = "expo.modules.hueble.STEP"
private const val ACTION_TOGGLE = "expo.modules.hueble.TOGGLE"
private const val EXTRA_DELTA = "delta"

/** Distinct request codes, or the PendingIntents collapse into each other. */
private const val CODE_DOWN = 1
private const val CODE_UP = 2
private const val CODE_TOGGLE = 3
private const val CODE_OPEN = 4

@SuppressLint("MissingPermission")
class HueWidget : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    manager: AppWidgetManager,
    widgetIds: IntArray,
  ) {
    for (id in widgetIds) manager.updateAppWidget(id, draw(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    val action = intent.action
    if (action != ACTION_STEP && action != ACTION_TOGGLE) return

    val addresses = LampStore.addresses(context)
    if (addresses.isEmpty() || !allowed(context)) {
      // Nothing set up, or the Bluetooth permission has been taken away since
      // it was. Either way the widget says what it knows and the middle of it
      // opens the app, which is where both are fixed.
      refresh(context)
      return
    }

    val state = LampRegistry.snapshot()
    val live = state.connected > 0
    val on = if (live) state.on else LampStore.isOn(context)
    val level = (if (live) state.brightness else null) ?: LampStore.level(context)

    val wantedOn: Boolean
    val wantedLevel: Int?

    if (action == ACTION_TOGGLE) {
      wantedOn = !on
      // Coming back on at the level it was left at, not at whatever the last
      // step happened to be.
      wantedLevel = if (wantedOn) level else null
    } else {
      val delta = intent.getIntExtra(EXTRA_DELTA, 0)
      val span = MAX_BRIGHTNESS - MIN_BRIGHTNESS
      val stepped = level + (delta * STEP * span).toInt()
      wantedLevel = stepped.coerceIn(MIN_BRIGHTNESS, MAX_BRIGHTNESS)
      // Stepping up from off turns them on; stepping down never turns them
      // off, because the switch is right there and a slider that switches
      // things off at its own bottom end is a surprise on a home screen.
      wantedOn = if (!on && delta > 0) true else on
    }

    // Drawn from what was asked for, before anything has had time to answer.
    // A home screen button that waits a second and a half to acknowledge a
    // press feels broken even when it worked.
    show(context, readout(wantedOn, wantedLevel ?: level), wantedOn)

    val pending = goAsync()
    Thread {
      try {
        LampRegistry.useForWidget(context, addresses)
        LampRegistry.request(context, wantedOn, wantedLevel)
        Thread.sleep(SETTLE_MS)
        // And again from whatever actually happened, which is the honest
        // version if a lamp was out of range or switched off at the wall.
        draw(context).let { views ->
          AppWidgetManager.getInstance(context)
            .updateAppWidget(componentOf(context), views)
        }
      } catch (_: Exception) {
        // A widget that throws takes the home screen's launcher with it.
      } finally {
        pending.finish()
      }
    }.start()
  }

  companion object {
    /** Redraw every placed widget. Safe to call from anywhere, at any time. */
    fun refresh(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context) ?: return
        val component = componentOf(context)
        if (manager.getAppWidgetIds(component).isEmpty()) return
        manager.updateAppWidget(component, draw(context))
      } catch (_: Exception) {
        // No widget placed, or no manager on this device.
      }
    }

    private fun componentOf(context: Context) =
      ComponentName(context.applicationContext, HueWidget::class.java)

    /** Whether this app may still talk to a lamp at all. */
    private fun allowed(context: Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
        PackageManager.PERMISSION_GRANTED

    private fun percent(level: Int): Int {
      val span = MAX_BRIGHTNESS - MIN_BRIGHTNESS
      return Math.round((level - MIN_BRIGHTNESS) * 100f / span)
    }

    private fun readout(on: Boolean, level: Int): String =
      if (on) "${percent(level)}%" else "off"

    private fun step(context: Context, delta: Int, code: Int): PendingIntent {
      val intent = Intent(context.applicationContext, HueWidget::class.java)
        .setAction(if (delta == 0) ACTION_TOGGLE else ACTION_STEP)
        .putExtra(EXTRA_DELTA, delta)
        // Widget taps are user-driven, so they jump the queue of ordinary
        // background broadcasts rather than waiting behind them.
        .addFlags(Intent.FLAG_RECEIVER_FOREGROUND)

      return PendingIntent.getBroadcast(
        context.applicationContext,
        code,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    /** The whole widget, from the live lamps where there are any. */
    internal fun draw(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.hue_widget)

      val state = LampRegistry.snapshot()
      val live = state.connected > 0
      val set = LampStore.addresses(context).isNotEmpty()

      val on = if (live) state.on else LampStore.isOn(context)
      val level = (if (live) state.brightness else null) ?: LampStore.level(context)

      views.setTextViewText(
        R.id.hue_widget_level,
        when {
          !set -> context.getString(R.string.hue_widget_label)
          else -> readout(on, level)
        },
      )
      views.setTextViewText(
        R.id.hue_widget_power,
        context.getString(
          if (on) R.string.hue_widget_off else R.string.hue_widget_on,
        ),
      )

      views.setOnClickPendingIntent(R.id.hue_widget_down, step(context, -1, CODE_DOWN))
      views.setOnClickPendingIntent(R.id.hue_widget_up, step(context, 1, CODE_UP))
      views.setOnClickPendingIntent(R.id.hue_widget_power, step(context, 0, CODE_TOGGLE))

      // The middle opens the app, where the real slider is — and where lamps
      // are set up in the first place, which is what someone tapping a widget
      // that says "Kiosk lights" needs.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        views.setOnClickPendingIntent(
          R.id.hue_widget_level,
          PendingIntent.getActivity(
            context.applicationContext,
            CODE_OPEN,
            it,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
          ),
        )
      }

      return views
    }

    /** A one-line redraw, for the optimistic update before the radio answers. */
    private fun show(context: Context, text: String, on: Boolean = true) {
      try {
        val views = RemoteViews(context.packageName, R.layout.hue_widget)
        views.setTextViewText(R.id.hue_widget_level, text)
        views.setTextViewText(
          R.id.hue_widget_power,
          context.getString(if (on) R.string.hue_widget_off else R.string.hue_widget_on),
        )
        AppWidgetManager.getInstance(context)
          .partiallyUpdateAppWidget(
            AppWidgetManager.getInstance(context).getAppWidgetIds(componentOf(context)),
            views,
          )
      } catch (_: Exception) {
        // Nothing placed, or the launcher is not listening.
      }
    }
  }
}
