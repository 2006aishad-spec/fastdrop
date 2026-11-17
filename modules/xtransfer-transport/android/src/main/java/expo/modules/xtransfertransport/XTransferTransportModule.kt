package expo.modules.xtransfertransport

import android.content.Context
import android.net.wifi.WifiManager
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.util.concurrent.Executors

private const val DISCOVERY_GROUP = "239.255.42.42"
private const val DISCOVERY_PORT = 45555
private const val TRANSFER_PORT = 45556
private const val PROTOCOL_VERSION = "FD/01"
private const val MAX_ANNOUNCEMENT_BYTES = 8192

class XTransferTransportModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("XTransferTransport")

    AsyncFunction("scanDevices") { durationMs: Double, promise: Promise ->
      val boundedDuration = durationMs.toLong().coerceIn(1000L, 15000L)
      executor.execute {
        try {
          promise.resolve(discoverWindowsDevices(boundedDuration))
        } catch (error: Exception) {
          promise.reject("DISCOVERY_FAILED", error.message ?: "Falha na descoberta local.", error)
        }
      }
    }

    OnDestroy {
      executor.shutdownNow()
    }
  }

  private fun discoverWindowsDevices(durationMs: Long): List<Map<String, Any>> {
    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("Contexto Android indisponível.")
    val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val multicastLock = wifiManager.createMulticastLock("xtransfer-offline-discovery").apply {
      setReferenceCounted(false)
      acquire()
    }

    val devices = linkedMapOf<String, Map<String, Any>>()
    val group = InetAddress.getByName(DISCOVERY_GROUP)
    val endAt = SystemClock.elapsedRealtime() + durationMs

    try {
      MulticastSocket(null).use { socket ->
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(DISCOVERY_PORT))
        socket.soTimeout = 300
        val networkInterface = NetworkInterface.getByInetAddress(
          socket.localAddress.takeIf { !it.isAnyLocalAddress } ?: InetAddress.getLocalHost()
        ) ?: NetworkInterface.getNetworkInterfaces().toList().firstOrNull {
          it.isUp && !it.isLoopback && it.supportsMulticast()
        } ?: throw IllegalStateException("Nenhuma interface Wi-Fi com multicast disponível.")

        socket.joinGroup(InetSocketAddress(group, DISCOVERY_PORT), networkInterface)
        try {
          while (SystemClock.elapsedRealtime() < endAt) {
            val buffer = ByteArray(MAX_ANNOUNCEMENT_BYTES)
            val packet = DatagramPacket(buffer, buffer.size)
            try {
              socket.receive(packet)
            } catch (_: java.net.SocketTimeoutException) {
              continue
            }

            if (packet.length <= 0 || packet.length > MAX_ANNOUNCEMENT_BYTES) continue
            val json = try {
              JSONObject(String(packet.data, packet.offset, packet.length, Charsets.UTF_8))
            } catch (_: Exception) {
              continue
            }

            val deviceId = json.optString("deviceId")
            val name = json.optString("deviceName")
            val platform = json.optString("platform")
            val protocol = json.optString("protocolVersion")
            val port = json.optInt("transferPort", -1)
            val fingerprint = json.optString("certificateSha256").lowercase()
            val ipAddress = packet.address.hostAddress ?: continue

            if (deviceId.isBlank() || deviceId.length > 128 ||
              name.isBlank() || name.length > 80 ||
              platform != "Windows" || protocol != PROTOCOL_VERSION ||
              port != TRANSFER_PORT || !fingerprint.matches(Regex("^[a-f0-9]{64}$")) ||
              packet.address.isAnyLocalAddress || packet.address.isLoopbackAddress ||
              packet.address.isMulticastAddress
            ) continue

            devices[deviceId] = mapOf(
              "id" to deviceId,
              "name" to name,
              "platform" to platform,
              "protocolVersion" to protocol,
              "ipAddress" to ipAddress,
              "transferPort" to port,
              "certificateSha256" to fingerprint
            )
          }
        } finally {
          try {
            socket.leaveGroup(InetSocketAddress(group, DISCOVERY_PORT), networkInterface)
          } catch (_: Exception) {
          }
        }
      }
    } finally {
      if (multicastLock.isHeld) multicastLock.release()
    }

    return devices.values.toList()
  }
}
