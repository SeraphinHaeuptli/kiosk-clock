/*
 * Dimming Philips Hue lamps over Bluetooth, with no bridge in the room.
 *
 * Hue lamps sold since about 2019 speak Bluetooth as well as Zigbee, and the
 * Hue app drives up to ten of them that way with no bridge at all. This is the
 * same path: the phone connects straight to each lamp.
 *
 * What this module is responsible for: finding lamps, permissions, and the
 * surface JavaScript talks to. The connections themselves belong to
 * LampRegistry, one set per process, because the home screen widget drives the
 * same lamps with none of this module alive. The protocol, and the rules
 * Android imposes on a GATT connection, are in LampLink.
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
  private var scanning: ScanCallback? = null

  /**
   * The connections themselves live in LampRegistry, one set per process,
   * because the home screen widget drives the same lamps without any of this
   * module existing. This is the listener that turns a change there into an
   * event here.
   */
  private val onChanged: () -> Unit = {
    announce()
    appContext.reactContext?.let { HueWidget.refresh(it) }
  }

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
    val state = LampRegistry.snapshot()

    return mapOf(
      "total" to state.total,
      "connected" to state.connected,
      "on" to state.on,
      "brightness" to state.brightness,
      "problem" to state.problem,
      "lamps" to
        state.lamps.map {
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

  override fun definition() = ModuleDefinition {
    Name("HueBle")

    Events("onLamps")

    OnCreate { LampRegistry.addListener(onChanged) }

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

      val wanted = addresses.distinct().take(MAX_LAMPS)
      if (!LampRegistry.holdForApp(context, wanted)) {
        throw HueBleException("bluetooth is switched off")
      }

      snapshot()
    }

    Function("disconnect") {
      LampRegistry.releaseApp()
      true
    }

    Function("state") { snapshot() }

    /** Set the lamps. A null leaves that half of the state alone. */
    Function("request") { on: Boolean?, brightness: Int? ->
      if (LampRegistry.snapshot().total == 0) return@Function false
      LampRegistry.request(context, on, brightness)
      true
    }

    /**
     * Mirror which lamps were chosen somewhere the widget can read them.
     *
     * The home screen runs with the app closed, so this is the only way the
     * widget knows what to drive. Called from the same place that stores the
     * list on the JavaScript side.
     */
    Function("remember") { addresses: List<String>, name: String ->
      LampStore.remember(context, addresses.distinct().take(MAX_LAMPS), name)
      HueWidget.refresh(context)
      true
    }

    OnDestroy {
      LampRegistry.removeListener(onChanged)
      LampRegistry.releaseApp()
    }
  }
}
