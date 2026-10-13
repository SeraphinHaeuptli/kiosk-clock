/*
 * What the lamps are, written somewhere a widget can read it.
 *
 * The home screen widget runs with the app closed: no React Native, no
 * JavaScript, nothing to ask which lamps were picked. So the list is mirrored
 * into shared preferences whenever it changes, the same way the dock settings
 * are mirrored for the screen saver.
 *
 * The level is kept here too, and that is not a cache for its own sake: a
 * widget whose first act is "+10%" has to know what it is adding to, and the
 * lamps may be unreachable at that moment. What is stored is what this app
 * last asked for, which is the best guess available when nothing answers.
 */

package expo.modules.hueble

import android.content.Context

internal object LampStore {
  private const val PREFS = "kiosk.lights"
  private const val KEY_ADDRESSES = "addresses"
  private const val KEY_NAME = "name"
  private const val KEY_LEVEL = "level"
  private const val KEY_ON = "on"

  /** Halfway, for a widget that has never seen a lamp answer. */
  private const val DEFAULT_LEVEL = 127

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun addresses(context: Context): List<String> =
    (prefs(context).getString(KEY_ADDRESSES, "") ?: "")
      .split(',')
      .map { it.trim() }
      .filter { it.isNotEmpty() }

  /** What to call them on the widget: one lamp's name, or how many there are. */
  fun name(context: Context): String {
    val stored = prefs(context).getString(KEY_NAME, "") ?: ""
    return stored.ifEmpty { "lights" }
  }

  fun level(context: Context): Int =
    prefs(context).getInt(KEY_LEVEL, DEFAULT_LEVEL).coerceIn(MIN_BRIGHTNESS, MAX_BRIGHTNESS)

  fun isOn(context: Context): Boolean = prefs(context).getBoolean(KEY_ON, true)

  fun remember(context: Context, addresses: List<String>, name: String) {
    prefs(context)
      .edit()
      .putString(KEY_ADDRESSES, addresses.joinToString(","))
      .putString(KEY_NAME, name)
      .apply()
  }

  /** Records what was last asked for, from the app or from the widget. */
  fun record(context: Context, on: Boolean?, level: Int?) {
    val editor = prefs(context).edit()
    if (on != null) editor.putBoolean(KEY_ON, on)
    if (level != null) {
      editor.putInt(KEY_LEVEL, level.coerceIn(MIN_BRIGHTNESS, MAX_BRIGHTNESS))
    }
    editor.apply()
  }
}
