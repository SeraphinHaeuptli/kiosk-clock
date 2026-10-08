package expo.modules.dockdream

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.BatteryManager
import android.service.dreams.DreamService

/**
 * The screen saver that hands the screen to the clock.
 *
 * It draws nothing itself. Its whole job is to start the app and get out of
 * the way, because a dream already has what a background broadcast receiver
 * can never have: a visible window, which is the first exemption on Android's
 * background-activity-launch list. The receiver route — watch for the charger,
 * launch the app — has been blocked since Android 10 for every app without
 * SYSTEM_ALERT_WINDOW, and this app refuses that permission on purpose.
 *
 * The conditions come from shared preferences rather than from the app's own
 * settings store, which is a SQLite database this cannot read before any
 * JavaScript has run. `DockDreamModule` mirrors the two flags across whenever
 * they change.
 */
class KioskDreamService : DreamService() {

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()

    // Nothing here is meant to be looked at or touched; the activity arrives
    // within a frame or two and covers it.
    isFullscreen = true
    isScreenBright = true
    isInteractive = false

    if (!shouldLaunch()) {
      // Left running as a plain blank dream rather than finishing: ending it
      // immediately would hand the screen back and could have the system
      // start it again in a loop.
      return
    }

    launchApp()
  }

  private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun shouldLaunch(): Boolean {
    val settings = prefs()
    if (!settings.getBoolean(KEY_ENABLED, false)) return false

    if (settings.getBoolean(KEY_WIRELESS_ONLY, true) && !onWirelessCharger()) {
      return false
    }

    if (settings.getBoolean(KEY_LANDSCAPE_ONLY, false) && !inLandscape()) {
      return false
    }

    return true
  }

  /**
   * A sticky broadcast read rather than subscribed to: the current state is
   * all that matters, and `registerReceiver` with a null receiver returns the
   * last value without registering anything that would need removing.
   */
  private fun onWirelessCharger(): Boolean {
    return try {
      val status = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val plugged = status?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
      plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS
    } catch (_: Exception) {
      // A device that will not say is treated as not wireless, so the stricter
      // setting stays strict rather than failing open.
      false
    }
  }

  /**
   * Best effort, and the reason this condition is off by default: a phone with
   * rotation locked reports portrait however it is lying, so requiring
   * landscape on such a device means the clock never appears at all.
   */
  private fun inLandscape(): Boolean {
    return resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
  }

  private fun launchApp() {
    try {
      val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
      launch.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED or
          Intent.FLAG_ACTIVITY_SINGLE_TOP,
      )
      startActivity(launch)
    } catch (_: Exception) {
      // Nothing useful to do on a locked screen with no app to tell.
      return
    }

    // Finished only once the activity has been asked for, so the screen passes
    // to it rather than back to the lock screen.
    finish()
  }

  companion object {
    const val PREFS = "kiosk.dock"
    const val KEY_ENABLED = "enabled"
    const val KEY_WIRELESS_ONLY = "wirelessOnly"
    const val KEY_LANDSCAPE_ONLY = "landscapeOnly"
  }
}
