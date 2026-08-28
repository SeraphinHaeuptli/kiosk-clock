package expo.modules.nowplaying

import android.service.notification.NotificationListenerService

/**
 * A listener that deliberately listens to nothing.
 *
 * Android will only hand out active media sessions to an app the user has
 * granted Notification Access, and that grant is expressed by having an
 * enabled NotificationListenerService. The service's ComponentName is then the
 * token passed to MediaSessionManager.getActiveSessions.
 *
 * So this exists to be enabled, not to read notifications: no callbacks are
 * overridden, and no notification content is ever inspected or stored.
 */
class KioskNotificationListener : NotificationListenerService()
