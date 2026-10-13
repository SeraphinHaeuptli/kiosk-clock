/*
 * One Bluetooth connection to one Hue lamp.
 *
 * The protocol is not published by Signify. Everything here follows the
 * HueBLE library (https://github.com/flip-dots/HueBLE), which is also what
 * Home Assistant's hue_ble integration uses: lamps advertise service fe0f,
 * power is one byte on characteristic ...0002, brightness is one byte from 1
 * to 254 on ...0003. Characteristics are found by searching every service
 * rather than by looking inside a known one, because the service they sit
 * under is not consistent.
 *
 * Two Android rules shape the rest of this file:
 *
 *   1. Exactly one GATT operation may be outstanding at a time. A second
 *      write issued before the first one's callback arrives is dropped
 *      silently. So everything goes through a queue, and each operation waits
 *      for its callback or a timeout.
 *   2. The control characteristics are encrypted, so the phone has to be
 *      bonded to the lamp. The bond usually already exists — the Hue app made
 *      one — and is system-level rather than per-app, so the first attempt is
 *      simply to use it. Only an authentication error triggers createBond.
 *
 * Everything that touches the queue runs on the main looper; the state a
 * caller can read is volatile because the GATT callbacks arrive on a binder
 * thread.
 */

package expo.modules.hueble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.ArrayDeque
import java.util.UUID

internal val UUID_HUE_SERVICE: UUID = UUID.fromString("0000fe0f-0000-1000-8000-00805f9b34fb")
private val UUID_POWER: UUID = UUID.fromString("932c32bd-0002-47a2-835a-a8d455b859dd")
private val UUID_BRIGHTNESS: UUID = UUID.fromString("932c32bd-0003-47a2-835a-a8d455b859dd")
private val UUID_LAMP_NAME: UUID = UUID.fromString("97fe6561-0003-4f62-86e9-b71ee2da3d22")
private val UUID_CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

/** A lamp on the other side of a room answers in well under this. */
private const val OPERATION_TIMEOUT_MS = 6_000L

/** How long to wait before trying a dropped lamp again, by attempt. */
private val RETRY_DELAYS_MS = longArrayOf(2_000, 5_000, 10_000, 30_000)

/** Hue's own range. Zero is not off, it is the dimmest the lamp goes. */
internal const val MIN_BRIGHTNESS = 1
internal const val MAX_BRIGHTNESS = 254

/** The three GATT statuses that mean "bond with me first". */
private fun needsBond(status: Int): Boolean = status == 5 || status == 15 || status == 137

@SuppressLint("MissingPermission")
internal class LampLink(
  private val context: Context,
  private val device: BluetoothDevice,
  /** Fired whenever something a caller can see has changed. */
  private val onChanged: () -> Unit,
) {
  val address: String = device.address

  @Volatile
  var connected: Boolean = false
    private set

  @Volatile
  var on: Boolean? = null
    private set

  /** 1 to 254, as the lamp states it. */
  @Volatile
  var brightness: Int? = null
    private set

  /** The name the Hue app shows, once it has been read. */
  @Volatile
  var label: String? = null
    private set

  @Volatile
  var problem: String? = null
    private set

  private class Operation(val label: String, val start: () -> Boolean)

  private val main = Handler(Looper.getMainLooper())
  private val queue = ArrayDeque<Operation>()

  // Main-looper state. Nothing below this line is touched from a GATT thread
  // without going through `main.post`.
  private var running: Operation? = null
  private var ticket = 0L
  private var gatt: BluetoothGatt? = null
  private var powerChar: BluetoothGattCharacteristic? = null
  private var brightnessChar: BluetoothGattCharacteristic? = null
  private var attempt = 0
  private var closed = false
  private var bonding = false
  private var bondTried = false
  private var afterBond: Operation? = null
  private var wantOn: Boolean? = null
  private var wantBrightness: Int? = null
  private var powerQueued = false
  private var brightnessQueued = false

  /* -- The queue ----------------------------------------------------------- */

  private fun enqueue(operation: Operation) {
    main.post {
      if (closed) return@post
      queue.add(operation)
      pump()
    }
  }

  private fun pump() {
    if (closed || running != null || bonding) return
    val next = queue.poll() ?: return

    running = next
    ticket += 1
    val mine = ticket

    // A GATT operation that never calls back would otherwise wedge the queue
    // for as long as the app runs.
    main.postDelayed({
      if (ticket == mine && running != null) {
        problem = "the lamp stopped answering"
        finish()
      }
    }, OPERATION_TIMEOUT_MS)

    if (!next.start()) finish()
  }

  /** Called from a GATT callback once an operation has landed. */
  private fun finish() {
    main.post {
      if (running == null) return@post
      running = null
      ticket += 1
      pump()
    }
  }

  /* -- Connecting ---------------------------------------------------------- */

  fun open() {
    main.post {
      if (closed || gatt != null) return@post
      problem = null
      gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
      if (gatt == null) {
        problem = "could not open a connection"
        onChanged()
      }
    }
  }

  fun close() {
    main.post {
      closed = true
      queue.clear()
      running = null
      stopBondWatch()
      gatt?.let {
        it.disconnect()
        it.close()
      }
      gatt = null
      connected = false
    }
  }

  private fun dropped(client: BluetoothGatt?) {
    queue.clear()
    running = null
    powerQueued = false
    brightnessQueued = false
    bonding = false
    connected = false
    client?.close()
    if (gatt === client) gatt = null
    onChanged()

    if (closed) return
    val delay = RETRY_DELAYS_MS[minOf(attempt, RETRY_DELAYS_MS.size - 1)]
    attempt += 1
    main.postDelayed({ if (!closed && gatt == null) open() }, delay)
  }

  /* -- Reading and writing ------------------------------------------------- */

  private fun characteristic(client: BluetoothGatt, uuid: UUID): BluetoothGattCharacteristic? {
    // By UUID across every service: which service a Hue characteristic sits
    // under is not something to rely on.
    for (service in client.services) {
      val found = service.getCharacteristic(uuid)
      if (found != null) return found
    }
    return null
  }

  private fun readOf(uuid: UUID) = Operation("read $uuid") {
    val client = gatt ?: return@Operation false
    val target = characteristic(client, uuid) ?: return@Operation false
    client.readCharacteristic(target)
  }

  @Suppress("DEPRECATION")
  private fun notifyOf(characteristic: BluetoothGattCharacteristic) =
    Operation("notify ${characteristic.uuid}") {
      val client = gatt ?: return@Operation false
      if (!client.setCharacteristicNotification(characteristic, true)) return@Operation false

      val descriptor = characteristic.getDescriptor(UUID_CCCD) ?: return@Operation false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        client.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) ==
          BluetoothGatt.GATT_SUCCESS
      } else {
        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        client.writeDescriptor(descriptor)
      }
    }

  @Suppress("DEPRECATION")
  private fun write(characteristic: BluetoothGattCharacteristic, value: ByteArray): Boolean {
    val client = gatt ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      client.writeCharacteristic(
        characteristic,
        value,
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT,
      ) == BluetoothGatt.GATT_SUCCESS
    } else {
      characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      characteristic.value = value
      client.writeCharacteristic(characteristic)
    }
  }

  /**
   * Ask for a state, coalescing.
   *
   * A finger on a slider produces far more values than a radio can carry, so
   * what is queued is the *intent* to write, once; the value it finally sends
   * is whatever was last asked for. Dragging therefore costs one write per
   * round trip rather than one per pixel, and the value the finger stopped on
   * is always the one that lands.
   */
  fun request(on: Boolean?, level: Int?) {
    main.post {
      if (closed) return@post
      if (on != null) wantOn = on
      if (level != null) wantBrightness = level.coerceIn(MIN_BRIGHTNESS, MAX_BRIGHTNESS)

      if (wantOn != null && !powerQueued) {
        powerQueued = true
        queue.add(
          Operation("power") {
            powerQueued = false
            val target = powerChar ?: return@Operation false
            val wanted = wantOn ?: return@Operation false
            write(target, byteArrayOf(if (wanted) 1 else 0))
          },
        )
      }

      // After the power write, so a lamp coming on does not briefly show the
      // brightness it was left at months ago.
      if (wantBrightness != null && !brightnessQueued) {
        brightnessQueued = true
        queue.add(
          Operation("brightness") {
            brightnessQueued = false
            val target = brightnessChar ?: return@Operation false
            val wanted = wantBrightness ?: return@Operation false
            write(target, byteArrayOf(wanted.toByte()))
          },
        )
      }

      pump()
    }
  }

  private fun accept(uuid: UUID, value: ByteArray?) {
    if (value == null || value.isEmpty()) return
    when (uuid) {
      UUID_POWER -> on = value[0].toInt() != 0
      UUID_BRIGHTNESS -> brightness = value[0].toInt() and 0xff
      UUID_LAMP_NAME -> label = String(value, Charsets.UTF_8).trim().ifEmpty { null }
      else -> return
    }
    onChanged()
  }

  /* -- Bonding ------------------------------------------------------------- */

  private var bondWatch: BroadcastReceiver? = null

  private fun startBond(retry: Operation) {
    if (bondTried || closed) {
      problem = "the lamp refused the connection"
      onChanged()
      return
    }

    bondTried = true
    bonding = true
    afterBond = retry

    val watch = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
        val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)
        if (state == BluetoothDevice.BOND_BONDING) return

        main.post {
          stopBondWatch()
          bonding = false
          if (state == BluetoothDevice.BOND_BONDED) {
            afterBond?.let { queue.addFirst(it) }
          } else {
            problem = "pairing with the lamp failed"
            onChanged()
          }
          afterBond = null
          pump()
        }
      }
    }
    bondWatch = watch

    val filter = IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(watch, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(watch, filter)
    }

    val started = device.bondState == BluetoothDevice.BOND_BONDED || device.createBond()
    if (!started) {
      stopBondWatch()
      bonding = false
      afterBond = null
      problem = "the lamp would not pair — put it in pairing mode from the hue app"
      onChanged()
      pump()
    }
  }

  private fun stopBondWatch() {
    val watch = bondWatch ?: return
    bondWatch = null
    try {
      context.unregisterReceiver(watch)
    } catch (_: IllegalArgumentException) {
      // Never registered, or already gone.
    }
  }

  /* -- The callbacks ------------------------------------------------------- */

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(client: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        main.post { if (!closed) client.discoverServices() }
      } else {
        main.post { dropped(client) }
      }
    }

    override fun onServicesDiscovered(client: BluetoothGatt, status: Int) {
      main.post {
        if (closed) return@post
        if (status != BluetoothGatt.GATT_SUCCESS) {
          problem = "could not read the lamp's services"
          dropped(client)
          return@post
        }

        powerChar = characteristic(client, UUID_POWER)
        brightnessChar = characteristic(client, UUID_BRIGHTNESS)

        if (brightnessChar == null) {
          // Something that advertises like a Hue lamp but cannot be dimmed is
          // not something to keep retrying.
          problem = "this device has no brightness to set"
          closed = true
          dropped(client)
          return@post
        }

        connected = true
        attempt = 0
        bondTried = false
        problem = null
        onChanged()

        enqueue(readOf(UUID_LAMP_NAME))
        powerChar?.let {
          enqueue(readOf(UUID_POWER))
          enqueue(notifyOf(it))
        }
        brightnessChar?.let {
          enqueue(readOf(UUID_BRIGHTNESS))
          enqueue(notifyOf(it))
        }
      }
    }

    private fun landed(uuid: UUID, status: Int, value: ByteArray?) {
      if (status == BluetoothGatt.GATT_SUCCESS) {
        accept(uuid, value)
        finish()
        return
      }

      if (needsBond(status)) {
        // The operation goes back to the front of the queue once the bond is
        // in place, so nothing is lost to a lamp that wanted pairing first.
        main.post {
          val again = running
          running = null
          ticket += 1
          if (again != null) startBond(again) else pump()
        }
        return
      }

      problem = "the lamp refused that (status $status)"
      onChanged()
      finish()
    }

    // The pre-API-33 shape of the same callback. Both have to be here: the
    // framework calls whichever one its version knows about.
    @Suppress("DEPRECATION")
    override fun onCharacteristicRead(
      client: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int,
    ) {
      landed(characteristic.uuid, status, characteristic.value)
    }

    override fun onCharacteristicRead(
      client: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
      status: Int,
    ) {
      landed(characteristic.uuid, status, value)
    }

    override fun onCharacteristicWrite(
      client: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int,
    ) {
      // A write that went through is also the most recent truth about the
      // lamp, so the state is updated from what was sent rather than waiting
      // for a notification to say the same thing.
      if (status == BluetoothGatt.GATT_SUCCESS) {
        when (characteristic.uuid) {
          UUID_POWER -> wantOn?.let { on = it }
          UUID_BRIGHTNESS -> wantBrightness?.let { brightness = it }
        }
        onChanged()
        finish()
        return
      }
      landed(characteristic.uuid, status, null)
    }

    override fun onDescriptorWrite(
      client: BluetoothGatt,
      descriptor: BluetoothGattDescriptor,
      status: Int,
    ) {
      // A lamp that will not take a subscription is still perfectly
      // controllable; it just will not volunteer changes made elsewhere.
      finish()
    }

    @Suppress("DEPRECATION")
    override fun onCharacteristicChanged(
      client: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
    ) {
      accept(characteristic.uuid, characteristic.value)
    }

    override fun onCharacteristicChanged(
      client: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      value: ByteArray,
    ) {
      accept(characteristic.uuid, value)
    }
  }
}
