/*
 * Dimming Philips Hue lamps over Bluetooth, with no bridge in the room.
 *
 * Hue lamps sold since about 2019 speak Bluetooth as well as Zigbee, and the
 * Hue app drives up to ten of them that way with no bridge at all. This is the
 * same path: the phone connects straight to each lamp.
 *
 * What this module is responsible for: finding lamps, holding a connection to
 * each chosen one, and collapsing however many of them there are into the one
 * level a slider can show. The protocol itself, and the rules Android imposes
 * on a GATT connection, are in LampLink.
 *
 * Permissions are checked here and asked for from JavaScript, where there is a
 * screen to explain them on. Two of them prompt, which is new for this app —
 * see the manifest for what is and is not asked for, and why there is no
 * location permission among them.
 */

package expo.modules.hueble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal class HueBleException(message: String) : CodedException(message)

/** Hue's own ceiling for a bridgeless setup. */
private const val MAX_LAMPS = 10

private const val SCAN_SECONDS_MIN = 2
private const val SCAN_SECONDS_MAX = 20

@SuppressLint("MissingPermission")
class HueBleModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  /**
   * Reached from three threads — the JS thread for a slider write, the async
   * queue for connecting, the main looper for a state change — so every use
   * of it is inside this lock.
   */
  private val lamps = linkedMapOf<String, LampLink>()
  private val lock = Any()
  private var scanning: ScanCallback? = null

  private val context: Context
    get() = appContext.reactContext ?: throw HueBleException("no context")

  /**
   * The runtime permissions this needs on this version of Android.
   *
   * Before 12 there are none that prompt — but a scan on those versions needs
   * the location permission, which this app does not ask for, so scanning is
   * reported as unavailable rather than quietly returning nothing.
   */
  private fun required(): List<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    } else {
      emptyList()
    }

  private fun missing(): List<String> =
    required().filter {
      context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
    }

  private fun adapter() =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private fun snapshot(): Map<String, Any?> {
    val all = synchronized(lock) { lamps.values.toList() }
    val live = all.filter { it.connected }

    return mapOf(
      "total" to all.size,
      "connected" to live.size,
      // On if any of them is. The slider turns them on together, so the only
      // way they disagree is if something else changed one of them.
      "on" to live.any { it.on == true },
      // The first lamp with a reading. With several, the slider sets them all
      // to the same level, so the first one is the level — and if something
      // else has moved one of them, following the first is at least a rule
      // someone can predict.
      "brightness" to live.firstOrNull { it.brightness != null }?.brightness,
      "problem" to all.firstNotNullOfOrNull { it.problem },
      "lamps" to
        all.map {
          mapOf(
            "address" to it.address,
            "name" to it.label,
            "connected" to it.connected,
          )
        },
    )
  }

  private fun announce() {
    main.post {
      try {
        sendEvent("onLamps", snapshot())
      } catch (_: Exception) {
        // The JS side has gone; nothing to tell.
      }
    }
  }

  private fun forget() {
    val all = synchronized(lock) {
      val copy = lamps.values.toList()
      lamps.clear()
      copy
    }
    for (lamp in all) lamp.close()
  }

  override fun definition() = ModuleDefinition {
    Name("HueBle")

    Events("onLamps")

    /** What this device can do, before anything is attempted on it. */
    Function("capabilities") {
      val bluetooth = adapter()
      mapOf(
        "supported" to
          context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE),
        "enabled" to (bluetooth?.isEnabled ?: false),
        // Scanning below Android 12 needs ACCESS_FINE_LOCATION, which this app
        // deliberately does not have.
        "canScan" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S),
        "missingPermissions" to missing(),
      )
    }

    /**
     * Look for lamps for a few seconds.
     *
     * Filtered on the service id Hue lamps advertise, so this is not a survey
     * of every Bluetooth device in the building: a pair of headphones never
     * appears in the result.
     */
    AsyncFunction("scan") { seconds: Int, promise: Promise ->
      if (missing().isNotEmpty()) {
        throw HueBleException("bluetooth permission has not been granted")
      }
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        throw HueBleException("scanning needs android 12 or newer")
      }

      val bluetooth = adapter() ?: throw HueBleException("this phone has no bluetooth")
      if (!bluetooth.isEnabled) throw HueBleException("bluetooth is switched off")
      val scanner =
        bluetooth.bluetoothLeScanner ?: throw HueBleException("bluetooth is switched off")

      val found = linkedMapOf<String, String?>()
      var settled = false

      val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          val device = result.device ?: return
          // The advertised name first: reading it off the device needs the
          // connect permission, and this is a scan.
          val name = result.scanRecord?.deviceName ?: runCatching { device.name }.getOrNull()
          // Results arrive on a binder thread; the window that reads them
          // closes on the main one.
          main.post { found[device.address] = name }
        }

        override fun onScanFailed(errorCode: Int) {
          main.post {
            if (settled) return@post
            settled = true
            runCatching { scanner.stopScan(this) }
            scanning = null
            promise.reject(HueBleException("the scan failed (code $errorCode)"))
          }
        }
      }

      main.post {
        scanning?.let { runCatching { scanner.stopScan(it) } }
        scanning = callback

        val filter =
          ScanFilter.Builder().setServiceUuid(ParcelUuid(UUID_HUE_SERVICE)).build()
        val settings =
          ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()

        runCatching { scanner.startScan(listOf(filter), settings, callback) }
          .onFailure {
            settled = true
            scanning = null
            promise.reject(HueBleException(it.message ?: "the scan would not start"))
          }
      }

      val window = seconds.coerceIn(SCAN_SECONDS_MIN, SCAN_SECONDS_MAX) * 1_000L
      main.postDelayed({
        if (settled) return@postDelayed
        settled = true
        runCatching { scanner.stopScan(callback) }
        if (scanning === callback) scanning = null
        promise.resolve(
          found.map { (address, name) -> mapOf("address" to address, "name" to name) },
        )
      }, window)
    }

    /**
     * Hold a connection to each of these lamps.
     *
     * Returns at once. Connecting, bonding and reading the first state all
     * happen afterwards, and arrive as `onLamps` events — a lamp that is
     * switched off at the wall simply never connects, and the one that is
     * stays usable meanwhile.
     */
    AsyncFunction("connect") { addresses: List<String> ->
      if (missing().isNotEmpty()) {
        throw HueBleException("bluetooth permission has not been granted")
      }
      val bluetooth = adapter() ?: throw HueBleException("this phone has no bluetooth")
      if (!bluetooth.isEnabled) throw HueBleException("bluetooth is switched off")

      val wanted = addresses.distinct().take(MAX_LAMPS)

      // Resolved before the lock is taken, because this is the step that can
      // reject an address and nothing should be half-rearranged when it does.
      val devices = wanted.map { address ->
        address to
          (runCatching { bluetooth.getRemoteDevice(address) }.getOrNull()
            ?: throw HueBleException("$address is not an address this phone knows"))
      }

      val dropped: List<LampLink>
      val started: List<LampLink>
      synchronized(lock) {
        // Anything no longer on the list goes, so re-connecting with a changed
        // list is the whole of the "I picked different lamps" case.
        dropped = (lamps.keys.toList() - wanted.toSet()).mapNotNull { lamps.remove(it) }

        started = devices.filterNot { (address, _) -> lamps.containsKey(address) }
          .map { (address, device) ->
            val lamp = LampLink(context, device) { announce() }
            lamps[address] = lamp
            lamp
          }
      }

      for (lamp in dropped) lamp.close()
      for (lamp in started) lamp.open()

      announce()
      snapshot()
    }

    Function("disconnect") {
      forget()
      announce()
      true
    }

    Function("state") { snapshot() }

    /** Set the lamps. A null leaves that half of the state alone. */
    Function("request") { on: Boolean?, brightness: Int? ->
      val all = synchronized(lock) { lamps.values.toList() }
      if (all.isEmpty()) return@Function false
      for (lamp in all) lamp.request(on, brightness)
      true
    }

    OnDestroy {
      forget()
    }
  }
}
