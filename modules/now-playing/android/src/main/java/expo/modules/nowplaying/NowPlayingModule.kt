package expo.modules.nowplaying

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads what is playing on the device.
 *
 * This is the approach scrobblers and lock-screen replacements use:
 * MediaSessionManager reports every active session, and each MediaController
 * carries structured MediaMetadata. Parsing the media notification's text
 * would be the alternative, and is strictly worse — the metadata is already
 * typed, so there is nothing to scrape.
 */
class NowPlayingModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No react context" }

  override fun definition() = ModuleDefinition {
    Name("NowPlaying")

    Function("hasPermission") { hasNotificationAccess() }

    // Not every Android build has this screen. Stripped OEM ROMs and TV
    // launchers ship without the notification-listener settings activity, and
    // the resulting ActivityNotFoundException is the caller's problem to
    // handle, not the user's to see: the button does nothing, which is already
    // the truth of the situation on such a device.
    Function("openPermissionSettings") {
      try {
        context.startActivity(
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      } catch (error: Exception) {
        // Nowhere to send them.
      }
    }

    Function("getNowPlaying") { readNowPlaying() }
  }

  /**
   * Whether this package appears in the system's enabled-listeners list. There
   * is no callback for the grant: the user leaves for system settings and
   * comes back, so callers re-check rather than being told.
   */
  private fun hasNotificationAccess(): Boolean = try {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      "enabled_notification_listeners",
    )

    enabled != null &&
      enabled.split(':').any { it.startsWith("${context.packageName}/") }
  } catch (error: Exception) {
    // A secure setting read goes through a content provider and out to
    // system_server, and there is no context to read it from at all while the
    // app is being torn down. Not granted is the safe answer to every one of
    // those, and this is polled every few seconds for hours at a time.
    false
  }

  /**
   * Everything below the permission check is a binder call into system_server,
   * so the failures are the ones that come with talking to another process.
   *
   * Catching only SecurityException was reading the documentation rather than
   * the field reports: the grant being revoked mid-call is merely the tidiest
   * way this fails. getActiveSessions also throws when system_server has
   * restarted underneath a long-running app, a MediaController can be released
   * between being handed over and being read, and MEDIA_SESSION_SERVICE is not
   * guaranteed to resolve on every OEM build the app installs on. All of them
   * mean the same thing to a clock — no track — and none of them is worth
   * building an exception and a stack trace for once every five seconds for as
   * long as the device is docked.
   */
  private fun readNowPlaying(): Map<String, Any?>? {
    if (!hasNotificationAccess()) return null

    return try {
      val manager =
        context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
          ?: return null
      val listener = ComponentName(context, KioskNotificationListener::class.java)
      val sessions = manager.getActiveSessions(listener)

      // Sessions arrive in priority order, but a paused app can outrank the one
      // making noise, so prefer whatever is actually playing.
      val controller =
        sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
          ?: sessions.firstOrNull()
          ?: return null

      describe(controller)
    } catch (error: Exception) {
      null
    }
  }

  private fun describe(controller: MediaController): Map<String, Any?>? {
    val metadata = controller.metadata ?: return null

    // A session with no title is not worth showing; some apps hold an empty
    // session open long after playback has finished.
    val title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE)
      ?.takeIf { it.isNotBlank() }
      ?: return null

    return mapOf(
      "title" to title,
      "artist" to metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)
        ?.takeIf { it.isNotBlank() },
      "playing" to (controller.playbackState?.state == PlaybackState.STATE_PLAYING),
    )
  }
}
