package expo.modules.dockdream

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of the screen saver.
 *
 * Two jobs: mirror the dock settings somewhere the dream can read them before
 * any JavaScript exists, and open the system screen where the user chooses a
 * screen saver. Choosing it is theirs to do — an app cannot nominate itself,
 * which is the same shape as the notification-access grant the now-playing
 * source needs.
 */
class DockDreamModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DockDream")

    Function("setRules") { enabled: Boolean, wirelessOnly: Boolean, landscapeOnly: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      context
        .getSharedPreferences(KioskDreamService.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KioskDreamService.KEY_ENABLED, enabled)
        .putBoolean(KioskDreamService.KEY_WIRELESS_ONLY, wirelessOnly)
        .putBoolean(KioskDreamService.KEY_LANDSCAPE_ONLY, landscapeOnly)
        .apply()
      true
    }

    Function("openScreenSaverSettings") {
      val context = appContext.reactContext ?: return@Function false
      try {
        // The dream settings screen proper. Some makers bury or remove it, so
        // the display settings are tried next rather than leaving the button
        // doing nothing at all.
        val intents = listOf(
          Intent(Settings.ACTION_DREAM_SETTINGS),
          Intent(Settings.ACTION_DISPLAY_SETTINGS),
        )
        for (intent in intents) {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
            return@Function true
          }
        }
        false
      } catch (_: Exception) {
        false
      }
    }
  }
}
