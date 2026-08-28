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

    Function("openPermissionSettings") {
      context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    Function("getNowPlaying") { readNowPlaying() }
  }

  /**
   * Whether this package appears in the system's enabled-listeners list. There
   * is no callback for the grant: the user leaves for system settings and
   * comes back, so callers re-check rather than being told.
   */
  private fun hasNotificationAccess(): Boolean {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      "enabled_notification_listeners",
    ) ?: return false

    return enabled.split(':').any { it.startsWith("${context.packageName}/") }
  }

  private fun readNowPlaying(): Map<String, Any?>? {
    if (!hasNotificationAccess()) return null

    return try {
      val manager =
        context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
      val listener = ComponentName(context, KioskNotificationListener::class.java)
      val sessions = manager.getActiveSessions(listener)

      // Sessions arrive in priority order, but a paused app can outrank the one
      // making noise, so prefer whatever is actually playing.
      val controller =
        sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
          ?: sessions.firstOrNull()
          ?: return null

      describe(controller)
    } catch (error: SecurityException) {
      // The grant can be revoked between the check above and this call.
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
