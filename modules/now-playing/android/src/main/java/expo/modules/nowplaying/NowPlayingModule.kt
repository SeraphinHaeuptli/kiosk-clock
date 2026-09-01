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

    /**
     * Drive the same session the bar is showing.
     *
     * A controller obtained this way carries transport controls as well as
     * metadata — the notification-listener grant is what authorises both, so
     * this asks for nothing the app was not already given. Returns whether the
     * command went out, which is not the same as the player having obeyed it:
     * the answer to that arrives on the next read, not from here.
     */
    Function("control") { action: String -> control(action) }
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
  /**
   * The one session the app speaks to, chosen the same way for reading and for
   * controlling — otherwise a skip could land on a different player from the
   * one named on screen.
   */
  private fun activeController(): MediaController? {
    if (!hasNotificationAccess()) return null

    return try {
      val manager =
        context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
          ?: return null
      val listener = ComponentName(context, KioskNotificationListener::class.java)
      val sessions = manager.getActiveSessions(listener)

      // Sessions arrive in priority order, but a paused app can outrank the one
      // making noise, so prefer whatever is actually playing.
      sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
        ?: sessions.firstOrNull()
    } catch (error: Exception) {
      null
    }
  }

  private fun readNowPlaying(): Map<String, Any?>? {
    val controller = activeController() ?: return null

    return try {
      describe(controller)
    } catch (error: Exception) {
      null
    }
  }

  /**
   * Play/pause is resolved here rather than in the interface, because whether
   * a session is playing is only knowable at the moment the command is sent.
   * Deciding it one render earlier means a tap during the gap between the poll
   * and the press sends the wrong one of the pair.
   */
  private fun control(action: String): Boolean {
    val controller = activeController() ?: return false

    return try {
      val controls = controller.transportControls

      when (action) {
        "next" -> controls.skipToNext()
        "previous" -> controls.skipToPrevious()
        "playPause" ->
          if (controller.playbackState?.state == PlaybackState.STATE_PLAYING) {
            controls.pause()
          } else {
            controls.play()
          }
        else -> return false
      }

      true
    } catch (error: Exception) {
      // Same binder failures as reading, plus a session that was released
      // between being chosen and being told to do something.
      false
    }
  }

  private fun describe(controller: MediaController): Map<String, Any?>? {
    val metadata = controller.metadata ?: return null

    // A session with no title is not worth showing; some apps hold an empty
    // session open long after playback has finished.
    val title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE)
      ?.takeIf { it.isNotBlank() }
      ?: return null

    val state = controller.playbackState
    val actions = state?.actions ?: 0L

    /*
      What the session says it can do — and a session that says nothing is
      taken at its word only when it has said something.

      Plenty of Android players advertise an incomplete action mask, or none at
      all, while responding to every command perfectly well. Hiding a control
      on that evidence would leave the bar inert for apps that work, which is
      the worse of the two mistakes: a button that does nothing is a moment's
      annoyance, a missing button is a feature the user cannot reach. So an
      empty mask means show everything, and a populated one is believed.
    */
    fun advertises(mask: Long): Boolean = actions == 0L || (actions and mask) != 0L

    return mapOf(
      "title" to title,
      "artist" to metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)
        ?.takeIf { it.isNotBlank() },
      "playing" to (state?.state == PlaybackState.STATE_PLAYING),
      "canNext" to advertises(PlaybackState.ACTION_SKIP_TO_NEXT),
      "canPrevious" to advertises(PlaybackState.ACTION_SKIP_TO_PREVIOUS),
      "canPlayPause" to advertises(
        PlaybackState.ACTION_PLAY_PAUSE or
          PlaybackState.ACTION_PLAY or
          PlaybackState.ACTION_PAUSE,
      ),
    )
  }
}
