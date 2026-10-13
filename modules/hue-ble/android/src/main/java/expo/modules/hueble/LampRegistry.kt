/*
 * The one set of lamp connections in this process.
 *
 * It used to live inside the Expo module, which was fine while the app was the
 * only thing driving lamps. The home screen widget is not the app: its
 * broadcast receiver runs in the same process but with no React Native in it,
 * and both have to end up talking to the same connections rather than opening
 * a second set behind each other's back.
 *
 * Who is holding what:
 *
 *   - The app holds the lamps for as long as a bar is on screen, and says so
 *     explicitly. That is the long-lived case.
 *   - The widget borrows them for a few seconds at a time. When it is done and
 *     the app is not holding, the connections close — a home screen button has
 *     no business keeping a radio link open to three light bulbs.
 */

package expo.modules.hueble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArraySet

/** How long the widget's borrowed connections survive its last tap. */
private const val WIDGET_IDLE_MS = 30_000L

internal class LampsSnapshot(
  val total: Int,
  val connected: Int,
  val on: Boolean,
  val brightness: Int?,
  val problem: String?,
  val lamps: List<LampLink>,
)

@SuppressLint("MissingPermission")
internal object LampRegistry {
  private val lamps = linkedMapOf<String, LampLink>()
  private val lock = Any()
  private val listeners = CopyOnWriteArraySet<() -> Unit>()
  private val main = Handler(Looper.getMainLooper())

  /** True while a screen in the app wants the lamps connected. */
  private var appHolding = false
  private var idleClose: Runnable? = null

  fun addListener(listener: () -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: () -> Unit) {
    listeners.remove(listener)
  }

  private fun announce() {
    for (listener in listeners) listener()
  }

  fun snapshot(): LampsSnapshot {
    val all = synchronized(lock) { lamps.values.toList() }
    val live = all.filter { it.connected }

    return LampsSnapshot(
      total = all.size,
      connected = live.size,
      // On if any of them is. The slider turns them on together, so the only
      // way they disagree is if something else changed one of them.
      on = live.any { it.on == true },
      // The first lamp with a reading. With several, the slider sets them all
      // to the same level, so the first one is the level — and if something
      // else has moved one of them, following the first is at least a rule
      // someone can predict.
      brightness = live.firstOrNull { it.brightness != null }?.brightness,
      problem = all.firstNotNullOfOrNull { it.problem },
      lamps = all,
    )
  }

  private fun adapter(context: Context) =
    (context.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE)
      as? BluetoothManager)
      ?.adapter

  /**
   * Bring the connections in line with this list, opening what is new and
   * closing what has gone. Returns false when Bluetooth cannot be used at all.
   */
  fun connect(context: Context, addresses: List<String>): Boolean {
    val bluetooth = adapter(context) ?: return false
    if (!bluetooth.isEnabled) return false

    val wanted = addresses.distinct()
    val devices = wanted.mapNotNull { address ->
      runCatching { bluetooth.getRemoteDevice(address) }.getOrNull()?.let { address to it }
    }

    val dropped: List<LampLink>
    val started: List<LampLink>
    synchronized(lock) {
      dropped = (lamps.keys.toList() - wanted.toSet()).mapNotNull { lamps.remove(it) }
      started = devices.filterNot { (address, _) -> lamps.containsKey(address) }
        .map { (address, device) ->
          val lamp = LampLink(context.applicationContext, device) { announce() }
          lamps[address] = lamp
          lamp
        }
    }

    for (lamp in dropped) lamp.close()
    for (lamp in started) lamp.open()
    announce()
    return true
  }

  fun request(context: Context, on: Boolean?, level: Int?) {
    val all = synchronized(lock) { lamps.values.toList() }
    for (lamp in all) lamp.request(on, level)
    // Recorded wherever the instruction came from, so the widget's next step
    // is relative to what actually happened rather than to what it last saw.
    LampStore.record(context, on, level)
  }

  fun close() {
    val all = synchronized(lock) {
      val copy = lamps.values.toList()
      lamps.clear()
      copy
    }
    for (lamp in all) lamp.close()
    announce()
  }

  /* -- Who is holding ------------------------------------------------------ */

  fun holdForApp(context: Context, addresses: List<String>): Boolean {
    appHolding = true
    cancelIdleClose()
    return connect(context, addresses)
  }

  fun releaseApp() {
    appHolding = false
    close()
  }

  /**
   * Borrow the lamps for a widget tap, and let them go shortly afterwards —
   * unless the app is holding them, in which case they were never the
   * widget's to close.
   */
  fun useForWidget(context: Context, addresses: List<String>): Boolean {
    cancelIdleClose()
    val ok = connect(context, addresses)

    val release = Runnable {
      idleClose = null
      if (!appHolding) close()
    }
    idleClose = release
    main.postDelayed(release, WIDGET_IDLE_MS)
    return ok
  }

  private fun cancelIdleClose() {
    idleClose?.let { main.removeCallbacks(it) }
    idleClose = null
  }
}
