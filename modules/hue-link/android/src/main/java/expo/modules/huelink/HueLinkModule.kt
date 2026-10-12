/*
 * One HTTPS request to one Philips Hue bridge on the local network.
 *
 * This exists because a Hue bridge cannot be reached from JavaScript's `fetch`
 * at all, and the reason is worth writing down: the bridge speaks HTTPS with a
 * certificate that no public authority has signed, issued to its own bridge id
 * rather than to an address. There is no subjectAltName on it, so standard
 * name verification against "192.168.1.x" fails before anything else is even
 * considered. React Native's fetch offers no way to pin a certificate or to
 * replace the verifier, so the choice is between the bridge's old HTTP API —
 * which would mean permitting cleartext traffic app-wide, and which Signify
 * has said it will block once every bridge carries a signed certificate — and
 * doing the handshake here, where the rules can be written down.
 *
 * What replaces ordinary verification:
 *
 *   1. On the very first request, before anything is paired, the certificate's
 *      common name must equal the bridge id that `discovery.meethue.com`
 *      reported over a properly verified connection. That ties the thing on
 *      the LAN to a name obtained from outside it.
 *   2. The fingerprint of that certificate goes back to the caller, which
 *      stores it next to the application key the bridge issues. Every request
 *      afterwards must present exactly that certificate.
 *
 * So a machine on the same wifi cannot answer for the bridge after pairing
 * without also holding its private key. It could, in principle, impersonate a
 * bridge during the few seconds of pairing itself; what it would get for that
 * is the ability to be asked to dim some lights.
 *
 * Deliberately not done: `HttpsURLConnection.setDefaultSSLSocketFactory`. The
 * relaxed verifier below belongs to one connection to one address. Installing
 * it as the default would quietly apply it to the weather requests too.
 */

package expo.modules.huelink

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

internal class HueLinkException(message: String) : CodedException(message)

/** A bridge on the same network answers in milliseconds, or is not there. */
private const val TIMEOUT_MS = 6_000

/**
 * Cap on the reply. A bridge's own answers are a few kilobytes; what is not a
 * bridge can say anything, and `JSON.parse` on the other side will try to hold
 * all of it.
 */
private const val MAX_BODY_BYTES = 256 * 1024

private val IPV4 =
  Regex("""^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$""")

/**
 * The common name out of an RFC 2253 subject, which on a Hue bridge is its
 * bridge id and nothing else. Plain text extraction rather than an LDAP
 * parser: `javax.naming` is not part of Android, and a bridge id is sixteen
 * hex characters, so there is nothing here to escape.
 */
private val COMMON_NAME = Regex("""(?:^|,\s*)CN=([^,]+)""")

private val METHODS = setOf("GET", "POST", "PUT")

private fun commonName(certificate: X509Certificate): String? =
  COMMON_NAME.find(certificate.subjectX500Principal.name)?.groupValues?.get(1)?.trim()

private fun fingerprint(certificate: X509Certificate): String =
  MessageDigest.getInstance("SHA-256")
    .digest(certificate.encoded)
    .joinToString("") { "%02x".format(it.toInt() and 0xff) }

/**
 * Reports the certificate complaint rather than the handshake that wrapped it.
 *
 * A rejection surfaces as an SSLHandshakeException whose message is the
 * stringified cause, so without this the settings screen would show
 * "java.security.cert.CertificateException: ..." to someone who only wants to
 * know that the bridge is not the one they paired with.
 */
private fun describe(error: Throwable): String {
  var cause: Throwable? = error
  while (cause != null) {
    if (cause is CertificateException) {
      return cause.message ?: "the certificate was refused"
    }
    cause = cause.cause
  }
  return error.message ?: error.javaClass.simpleName
}

private fun read(stream: InputStream?): String {
  if (stream == null) return ""

  val collected = ByteArrayOutputStream()
  stream.use { input ->
    val chunk = ByteArray(8 * 1024)
    while (true) {
      val count = input.read(chunk)
      if (count <= 0) break
      if (collected.size() + count > MAX_BODY_BYTES) {
        throw HueLinkException("the reply was larger than a bridge ever sends")
      }
      collected.write(chunk, 0, count)
    }
  }
  return collected.toString("UTF-8")
}

/**
 * Trust for exactly one certificate, and nothing else on the network.
 *
 * `getAcceptedIssuers` is empty and `checkClientTrusted` throws, because this
 * manager is only ever handed to one client socket talking to one address.
 */
private class BridgeTrust(
  /** The fingerprint recorded at pairing, or null before there is one. */
  private val pinned: String?,
  /** The bridge id the certificate must name, checked only when unpinned. */
  private val bridgeId: String?,
) : X509TrustManager {
  override fun checkClientTrusted(chain: Array<X509Certificate>?, authType: String?) {
    throw CertificateException("this client presents no certificate")
  }

  override fun checkServerTrusted(chain: Array<X509Certificate>?, authType: String?) {
    val leaf =
      chain?.firstOrNull() ?: throw CertificateException("the bridge sent no certificate")

    // Checked here rather than after connecting, which is the whole point of
    // doing it in a trust manager: throwing during the handshake means the
    // request — and the application key in its header — is never sent to
    // whatever answered.
    if (pinned != null) {
      val seen = fingerprint(leaf)
      if (!seen.equals(pinned, ignoreCase = true)) {
        throw CertificateException(
          "the certificate changed since pairing, so this is not the same bridge",
        )
      }
      return
    }

    if (bridgeId != null) {
      val named = commonName(leaf)
      if (named == null || !named.equals(bridgeId, ignoreCase = true)) {
        throw CertificateException(
          "the certificate names ${named ?: "nothing"} rather than bridge $bridgeId",
        )
      }
    }
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

class HueLinkModule : Module() {
  /**
   * One thread of this module's own, rather than the queue Expo would
   * otherwise run this on.
   *
   * `AsyncFunction` bodies all share a single HandlerThread
   * ("expo.modules.AsyncFunctionQueue"), across every Expo module in the app.
   * A bridge that has been unplugged takes the full connect timeout to fail,
   * and blocking that queue for six seconds would hold up everything else
   * asking the native side a question — the haptic tick on the volume bar, a
   * battery reading, keep-awake. A request that can wait on a network belongs
   * off it.
   *
   * Single-threaded, so requests to the bridge queue behind each other instead
   * of arriving in parallel. That is the right shape for a box that asks to be
   * sent about one command a second.
   */
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "kiosk-hue-link").apply { isDaemon = true }
  }

  override fun definition() = ModuleDefinition {
    Name("HueLink")

    AsyncFunction("request") {
        ip: String,
        path: String,
        method: String,
        body: String?,
        appKey: String?,
        bridgeId: String?,
        pinned: String?,
        promise: Promise ->
      worker.execute {
        try {
          promise.resolve(send(ip, path, method, body, appKey, bridgeId, pinned))
        } catch (error: CodedException) {
          promise.reject(error)
        } catch (error: Exception) {
          promise.reject(HueLinkException(describe(error)))
        }
      }
    }

    OnDestroy {
      worker.shutdownNow()
    }
  }
}

private fun send(
  ip: String,
  path: String,
  method: String,
  body: String?,
  appKey: String?,
  bridgeId: String?,
  pinned: String?,
): Map<String, Any?> {
  // The address comes from storage or from a field someone typed in, and it is
  // about to be concatenated into a URL.
  if (!IPV4.matches(ip)) throw HueLinkException("$ip is not an address on your network")
  if (!path.startsWith("/")) throw HueLinkException("a path has to start with /")
  if (method !in METHODS) throw HueLinkException("$method is not a method this sends")

  /*
    A fresh context per request, which also means a fresh TLS session cache.
    A cached session resumes without consulting the trust manager, so sharing
    one would let the second and later requests of a session skip the pin check
    entirely. A handshake on a local network costs a few milliseconds, and this
    sends at most a couple of requests a second.
  */
  val context = SSLContext.getInstance("TLS")
  context.init(null, arrayOf<TrustManager>(BridgeTrust(pinned, bridgeId)), SecureRandom())

  val connection = URL("https://$ip$path").openConnection() as HttpsURLConnection
  try {
    connection.sslSocketFactory = context.socketFactory
    // Hostname verification cannot succeed against an address, and the trust
    // manager above has already replaced what it was for.
    connection.hostnameVerifier = HostnameVerifier { _, _ -> true }
    connection.connectTimeout = TIMEOUT_MS
    connection.readTimeout = TIMEOUT_MS
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.requestMethod = method
    connection.setRequestProperty("Accept", "application/json")
    if (appKey != null) connection.setRequestProperty("hue-application-key", appKey)

    if (body != null) {
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    }

    val status = connection.responseCode
    // The bridge answers a refused key with a body worth reading, so the error
    // stream is read rather than discarded.
    val text = read(if (status >= 400) connection.errorStream else connection.inputStream)

    val leaf = connection.serverCertificates.firstOrNull() as? X509Certificate
      ?: throw HueLinkException("the bridge sent no certificate")

    return mapOf(
      "status" to status,
      "body" to text,
      // Handed back on every reply, not only the first: it is how the caller
      // records what to pin when pairing succeeds.
      "fingerprint" to fingerprint(leaf),
    )
  } catch (error: CodedException) {
    throw error
  } catch (error: Exception) {
    throw HueLinkException(describe(error))
  } finally {
    connection.disconnect()
  }
}
