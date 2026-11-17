package expo.modules.xtransfertransport

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.SystemClock
import android.provider.OpenableColumns
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

private const val DISCOVERY_GROUP = "239.255.42.42"
private const val DISCOVERY_PORT = 45555
private const val TRANSFER_PORT = 45556
private const val PROTOCOL_VERSION = "FD/01"
private const val MAX_ANNOUNCEMENT_BYTES = 8192
private const val MAX_LINE_BYTES = 64 * 1024
private const val MAX_CHUNK_BYTES = 1024 * 1024
private const val PICK_FILES_REQUEST = 45557
private const val PROGRESS_EVENT = "onTransferProgress"

private enum class TransferAction { NONE, PAUSE, CANCEL }
private class TransferControl { @Volatile var action: TransferAction = TransferAction.NONE }
private data class SelectedDocument(val uri: Uri, val name: String, val size: Long, val mimeType: String)
private class TransferPaused : Exception("Transferência pausada.")
private class TransferCancelled : Exception("Transferência cancelada.")

class XTransferTransportModule : Module() {
  private val executor = Executors.newFixedThreadPool(2)
  private val activeTransfer = AtomicReference<TransferControl?>(null)
  private val pendingPicker = AtomicReference<Promise?>(null)

  override fun definition() = ModuleDefinition {
    Name("XTransferTransport")
    Events(PROGRESS_EVENT)

    AsyncFunction("scanDevices") { durationMs: Double, promise: Promise ->
      val boundedDuration = durationMs.toLong().coerceIn(1000L, 15000L)
      executor.execute {
        try { promise.resolve(discoverWindowsDevices(boundedDuration)) }
        catch (error: Exception) { promise.reject("DISCOVERY_FAILED", error.message ?: "Falha na descoberta local.", error) }
      }
    }

    AsyncFunction("pickFiles") { promise: Promise ->
      if (pendingPicker.get() != null) {
        promise.reject("PICKER_BUSY", "O seletor de ficheiros já está aberto.", null)
      } else {
        pendingPicker.set(promise)
        try {
          val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
          }
          appContext.throwingActivity.startActivityForResult(intent, PICK_FILES_REQUEST)
        } catch (error: Exception) {
          pendingPicker.compareAndSet(promise, null)
          promise.reject("PICKER_FAILED", error.message ?: "Não foi possível abrir o seletor Android.", error)
        }
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode == PICK_FILES_REQUEST) {
        val promise = pendingPicker.getAndSet(null)
        if (promise != null) {
          try {
            if (payload.resultCode != Activity.RESULT_OK || payload.data == null) {
              promise.resolve(emptyList<Map<String, Any>>())
            } else {
              val data = payload.data
              val context = appContext.applicationContext
              val uris = mutableListOf<Uri>()
              val clipData = data.clipData
              if (clipData != null) {
                for (index in 0 until clipData.itemCount) clipData.getItemAt(index).uri?.let { uris.add(it) }
              } else data.data?.let { uris.add(it) }

              val picked = uris.distinctBy { it.toString() }.map { uri ->
                try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                catch (_: SecurityException) { /* Provider may grant temporary read access only. */ }
                readDocumentMetadata(context, uri)
              }
              promise.resolve(picked.map {
                mapOf("uri" to it.uri.toString(), "name" to it.name, "size" to it.size, "mimeType" to it.mimeType)
              })
            }
          } catch (error: Exception) {
            promise.reject("PICKER_RESULT_FAILED", error.message ?: "Não foi possível ler os ficheiros escolhidos.", error)
          }
        }
      }
    }

    AsyncFunction("sendFiles") { device: Map<String, Any?>, code: String, files: List<Map<String, Any?>>, transferId: String, promise: Promise ->
      if (files.isEmpty()) {
        promise.reject("NO_FILES", "Seleciona pelo menos um ficheiro.", null)
      } else if (!transferId.matches(Regex("^[A-Za-z0-9_-]{8,128}$"))) {
        promise.reject("INVALID_TRANSFER_ID", "Identificador de transferência inválido.", null)
      } else {
        val control = TransferControl()
        if (!activeTransfer.compareAndSet(null, control)) {
          promise.reject("TRANSFER_BUSY", "Já existe uma transferência em curso.", null)
        } else {
          executor.execute {
            try { promise.resolve(transferFiles(device, code, files, transferId, control)) }
            catch (_: TransferPaused) { promise.resolve(mapOf("status" to "paused", "transferId" to transferId)) }
            catch (_: TransferCancelled) { promise.resolve(mapOf("status" to "cancelled", "transferId" to transferId)) }
            catch (error: Exception) {
              sendProgress("failed", transferId, 0L, 0L, "", error.message ?: "Falha na transferência.")
              promise.reject("TRANSFER_FAILED", error.message ?: "Falha na transferência local.", error)
            } finally { activeTransfer.compareAndSet(control, null) }
          }
        }
      }
    }

    AsyncFunction("pauseTransfer") {
      val control = activeTransfer.get()
      if (control == null) false else { control.action = TransferAction.PAUSE; true }
    }
    AsyncFunction("cancelTransfer") {
      val control = activeTransfer.get()
      if (control == null) false else { control.action = TransferAction.CANCEL; true }
    }
    OnDestroy {
      activeTransfer.get()?.action = TransferAction.CANCEL
      executor.shutdownNow()
    }
  }

  private fun isPrivateLanAddress(address: InetAddress): Boolean {
    if (address.address.size == 4) {
      val bytes = address.address.map { it.toInt() and 0xff }
      return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] in 16..31) ||
        (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254)
    }
    return address.isLinkLocalAddress || address.isSiteLocalAddress
  }

  private fun discoverWindowsDevices(durationMs: Long): List<Map<String, Any>> {
    val context = appContext.reactContext?.applicationContext ?: throw IllegalStateException("Contexto Android indisponível.")
    val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val multicastLock = wifiManager.createMulticastLock("xtransfer-offline-discovery").apply {
      setReferenceCounted(false); acquire()
    }
    val devices = linkedMapOf<String, Map<String, Any>>()
    val group = InetAddress.getByName(DISCOVERY_GROUP)
    val endAt = SystemClock.elapsedRealtime() + durationMs
    try {
      MulticastSocket(null).use { socket ->
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(DISCOVERY_PORT))
        socket.soTimeout = 300
        val networkInterface = NetworkInterface.getNetworkInterfaces().toList()
          .filter { it.isUp && !it.isLoopback && it.supportsMulticast() }
          .sortedBy { if (it.name.startsWith("wlan", true) || it.name.startsWith("wifi", true)) 0 else 1 }
          .firstOrNull() ?: throw IllegalStateException("Nenhuma interface de rede com multicast disponível.")
        socket.joinGroup(InetSocketAddress(group, DISCOVERY_PORT), networkInterface)
        try {
          while (SystemClock.elapsedRealtime() < endAt) {
            val buffer = ByteArray(MAX_ANNOUNCEMENT_BYTES)
            val packet = DatagramPacket(buffer, buffer.size)
            try { socket.receive(packet) } catch (_: java.net.SocketTimeoutException) { continue }
            if (packet.length <= 0 || packet.length > MAX_ANNOUNCEMENT_BYTES) continue
            val json = try { JSONObject(String(packet.data, packet.offset, packet.length, Charsets.UTF_8)) }
              catch (_: Exception) { continue }
            val deviceId = json.optString("deviceId")
            val name = json.optString("deviceName")
            val platform = json.optString("platform")
            val protocol = json.optString("protocolVersion")
            val port = json.optInt("transferPort", -1)
            val fingerprint = json.optString("certificateSha256").lowercase()
            val ipAddress = packet.address.hostAddress ?: continue
            if (deviceId.isBlank() || deviceId.length > 128 || name.isBlank() || name.length > 80 ||
              platform != "Windows" || protocol != PROTOCOL_VERSION || port != TRANSFER_PORT ||
              !fingerprint.matches(Regex("^[a-f0-9]{64}$")) || packet.address.isAnyLocalAddress ||
              packet.address.isLoopbackAddress || packet.address.isMulticastAddress ||
              !isPrivateLanAddress(packet.address)) continue
            devices[deviceId] = mapOf(
              "id" to deviceId, "name" to name, "platform" to platform, "protocolVersion" to protocol,
              "ipAddress" to ipAddress, "transferPort" to port, "certificateSha256" to fingerprint
            )
          }
        } finally {
          try { socket.leaveGroup(InetSocketAddress(group, DISCOVERY_PORT), networkInterface) } catch (_: Exception) { }
        }
      }
    } finally { if (multicastLock.isHeld) multicastLock.release() }
    return devices.values.toList()
  }

  private fun readDocumentMetadata(context: Context, uri: Uri): SelectedDocument {
    var name: String? = null
    var size = -1L
    var cursor: Cursor? = null
    try {
      cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
      if (cursor != null && cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (nameIndex >= 0) name = cursor.getString(nameIndex)
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
      }
    } finally { cursor?.close() }
    val safeName = name?.trim().orEmpty()
    if (safeName.isBlank() || safeName.length > 255 || safeName == "." || safeName == ".." ||
      safeName.contains('/') || safeName.contains('\\') || safeName.any { it.isISOControl() }) {
      throw IllegalArgumentException("Um ficheiro escolhido tem um nome inválido.")
    }
    if (size < 0) throw IllegalArgumentException("O Android não informou o tamanho de \"$safeName\"; escolhe uma cópia local ou outro fornecedor de ficheiros.")
    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
    return SelectedDocument(uri, safeName, size, mime)
  }

  private fun androidDeviceId(): String {
    val prefs = appContext.applicationContext.getSharedPreferences("xtransfer-offline", Context.MODE_PRIVATE)
    val existing = prefs.getString("device_id", null)
    if (!existing.isNullOrBlank()) return existing
    val created = "android-" + UUID.randomUUID().toString()
    prefs.edit().putString("device_id", created).apply()
    return created
  }

  private fun transferFiles(
    device: Map<String, Any?>, code: String, rawFiles: List<Map<String, Any?>>,
    transferId: String, control: TransferControl
  ): Map<String, Any> {
    val context = appContext.applicationContext
    val host = device["ipAddress"] as? String ?: throw IllegalArgumentException("Endereço do PC inválido.")
    val port = (device["transferPort"] as? Number)?.toInt() ?: TRANSFER_PORT
    val expectedFingerprint = (device["certificateSha256"] as? String)?.lowercase()
      ?: throw IllegalArgumentException("Fingerprint do certificado não encontrada.")
    if (!expectedFingerprint.matches(Regex("^[a-f0-9]{64}$")) || port != TRANSFER_PORT || code.trim().length != 6) {
      throw IllegalArgumentException("Dados do PC ou código de emparelhamento inválidos.")
    }
    val deviceId = androidDeviceId()
    val nonce = UUID.randomUUID().toString().replace("-", "")
    val documents = rawFiles.map { item ->
      val uriText = item["uri"] as? String ?: throw IllegalArgumentException("URI de ficheiro inválida.")
      val name = item["name"] as? String ?: throw IllegalArgumentException("Nome de ficheiro inválido.")
      val size = (item["size"] as? Number)?.toLong() ?: throw IllegalArgumentException("Tamanho de ficheiro inválido.")
      val mimeType = item["mimeType"] as? String ?: "application/octet-stream"
      val fileId = item["fileId"] as? String ?: UUID.randomUUID().toString().replace("-", "")
      if (!fileId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) || size < 0L) throw IllegalArgumentException("Metadados de ficheiro inválidos.")
      SelectedDocument(Uri.parse(uriText), name, size, mimeType) to fileId
    }
    val totalBytes = documents.sumOf { it.first.size }
    if (totalBytes < 0L || totalBytes > 500L * 1024 * 1024 * 1024) throw IllegalArgumentException("O conjunto de ficheiros excede o limite de 500 GB.")

    checkAction(control)
    sendProgress("hashing", transferId, 0L, totalBytes, "", "A calcular SHA-256 dos ficheiros.")
    val fileHashes = documents.map { (document, fileId) ->
      checkAction(control)
      mapOf(
        "fileId" to fileId, "name" to document.name, "size" to document.size,
        "kind" to when {
          document.mimeType.startsWith("image/") -> "image"
          document.mimeType.startsWith("video/") -> "video"
          document.mimeType.startsWith("audio/") -> "audio"
          else -> "document"
        },
        "sha256" to hashDocument(context, document, control)
      )
    }

    checkAction(control)
    sendProgress("connecting", transferId, 0L, totalBytes, "", "A validar o certificado TLS do PC.")
    val sslContext = SSLContext.getInstance("TLS").apply {
      init(null, arrayOf(pinnedTrustManager(expectedFingerprint)), SecureRandom())
    }
    val socket = sslContext.socketFactory.createSocket() as SSLSocket
    socket.use { tls ->
      tls.connect(InetSocketAddress(host, port), 10000)
      tls.soTimeout = 30000
      tls.keepAlive = true
      tls.tcpNoDelay = true
      tls.enabledProtocols = tls.supportedProtocols.filter { it == "TLSv1.2" || it == "TLSv1.3" }.toTypedArray()
      tls.startHandshake()
      val peer = tls.session.peerCertificates.firstOrNull() as? X509Certificate
        ?: throw CertificateException("O PC não apresentou um certificado X.509.")
      val actualFingerprint = sha256(peer.encoded)
      if (!MessageDigest.isEqual(actualFingerprint.toByteArray(), expectedFingerprint.toByteArray())) {
        throw CertificateException("A fingerprint TLS do PC não corresponde ao anúncio recebido. Ligação bloqueada.")
      }
      sendProgress("pairing", transferId, 0L, totalBytes, "", "Certificado TLS validado. A confirmar o código de emparelhamento.")
      val input = tls.inputStream
      val output = tls.outputStream

      writeMessage(output, "PAIR", JSONObject().put("deviceId", deviceId).put("code", code.trim().uppercase()).put("nonce", nonce))
      val pairReply = readMessage(input)
      if (pairReply.first != "PAIR_ACCEPTED") throw IllegalStateException(pairReply.second.optString("message", "O Windows rejeitou o emparelhamento."))
      val sessionId = pairReply.second.optString("sessionId")
      val token = pairReply.second.optString("token")
      if (sessionId.isBlank() || token.isBlank()) throw IllegalStateException("Resposta de emparelhamento incompleta.")

      writeMessage(output, "AUTH", JSONObject().put("sessionId", sessionId).put("token", token))
      val manifest = JSONObject()
        .put("sessionId", sessionId).put("deviceId", deviceId)
        .put("transferId", transferId).put("files", JSONArray(fileHashes))
      writeMessage(output, "MANIFEST", manifest)
      val manifestReply = readMessage(input)
      if (manifestReply.first != "MANIFEST_ACCEPTED") throw IllegalStateException(manifestReply.second.optString("message", "O Windows rejeitou o manifesto."))

      var totalAcknowledged = 0L
      for ((index, pair) in documents.withIndex()) {
        checkAction(control, output, input, sessionId, transferId)
        val (document, fileId) = pair
        val fileHash = fileHashes[index]["sha256"] as String
        writeMessage(output, "FILE_BEGIN", JSONObject().put("fileId", fileId))
        val resumeReply = readMessage(input)
        if (resumeReply.first != "RESUME" || resumeReply.second.optString("fileId") != fileId) {
          throw IllegalStateException("O Windows não devolveu um offset de retoma válido.")
        }
        var offset = resumeReply.second.optLong("offset", -1L)
        if (offset < 0L || offset > document.size) throw IllegalStateException("Offset de retoma fora dos limites do ficheiro.")

        context.contentResolver.openInputStream(document.uri).use { stream ->
          if (stream == null) throw IllegalStateException("Não foi possível abrir o ficheiro.")
          skipExactly(stream, offset)
          while (offset < document.size) {
            checkAction(control, output, input, sessionId, transferId)
            val chunkSize = minOf(MAX_CHUNK_BYTES.toLong(), document.size - offset).toInt()
            val bytes = ByteArray(chunkSize)
            readExactly(stream, bytes)
            val chunkHash = sha256(bytes)
            val header = JSONObject().put("fileId", fileId).put("offset", offset)
              .put("length", chunkSize).put("sha256", chunkHash)
            writeLine(output, "CHUNK " + header.toString())
            output.write(bytes)
            output.flush()
            val ack = readMessage(input)
            val nextOffset = ack.second.optLong("offset", -1L)
            if (ack.first != "ACK" || ack.second.optString("fileId") != fileId || nextOffset != offset + chunkSize) {
              throw IllegalStateException("O Windows não confirmou o chunk enviado.")
            }
            offset = nextOffset
            sendProgress("sending", transferId, totalAcknowledged + offset, totalBytes, document.name, "A enviar e confirmar os blocos.")
          }
        }

        checkAction(control, output, input, sessionId, transferId)
        writeMessage(output, "FILE_END", JSONObject().put("fileId", fileId).put("sha256", fileHash))
        val complete = readMessage(input)
        if (complete.first != "FILE_COMPLETE" || complete.second.optString("fileId") != fileId) {
          throw IllegalStateException("O Windows não confirmou a integridade final de o ficheiro.")
        }
        totalAcknowledged += document.size
        sendProgress("file-complete", transferId, totalAcknowledged, totalBytes, document.name, "SHA-256 confirmado pelo Windows.")
      }
      checkAction(control, output, input, sessionId, transferId)
      sendProgress("completed", transferId, totalBytes, totalBytes, "", "Todos os ficheiros foram recebidos e verificados.")
    }
    return mapOf("status" to "completed", "transferId" to transferId, "fileCount" to documents.size, "totalBytes" to totalBytes)
  }

  private fun checkAction(
    control: TransferControl, output: java.io.OutputStream? = null, input: InputStream? = null,
    sessionId: String = "", transferId: String = ""
  ) {
    when (control.action) {
      TransferAction.NONE -> return
      TransferAction.PAUSE -> {
        sendProgress("paused", transferId, 0L, 0L, "", "Ligação pausada. Os blocos recebidos permanecem disponíveis para retoma.")
        throw TransferPaused()
      }
      TransferAction.CANCEL -> {
        if (output != null && input != null && sessionId.isNotBlank()) {
          try {
            writeLine(output, "CANCEL")
            val reply = readMessage(input)
            if (reply.first != "CANCELLED") throw IllegalStateException("O Windows não confirmou o cancelamento.")
          } catch (_: Exception) { /* Unacknowledged chunks are never marked as complete. */ }
        }
        sendProgress("cancelled", transferId, 0L, 0L, "", "Transferência cancelada.")
        throw TransferCancelled()
      }
    }
  }

  private fun hashDocument(context: Context, document: SelectedDocument, control: TransferControl): String {
    val digest = MessageDigest.getInstance("SHA-256")
    var total = 0L
    context.contentResolver.openInputStream(document.uri).use { stream ->
      if (stream == null) throw IllegalStateException("Não foi possível abrir o ficheiro.")
      val buffer = ByteArray(64 * 1024)
      while (true) {
        checkAction(control)
        val read = stream.read(buffer)
        if (read < 0) break
        if (read == 0) continue
        total += read
        if (total > document.size) throw IllegalStateException("o ficheiro mudou de tamanho durante a leitura.")
        digest.update(buffer, 0, read)
      }
    }
    if (total != document.size) throw IllegalStateException("O tamanho de o ficheiro mudou; seleciona o ficheiro novamente.")
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun pinnedTrustManager(expectedFingerprint: String): X509TrustManager = object : X509TrustManager {
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
      throw CertificateException("Certificado de cliente não esperado.")
    }
    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
      val certificate = chain?.firstOrNull() ?: throw CertificateException("Certificado TLS ausente.")
      try { certificate.checkValidity() } catch (error: Exception) {
        throw CertificateException("Certificado TLS fora do período de validade.", error)
      }
      if (!MessageDigest.isEqual(sha256(certificate.encoded).toByteArray(), expectedFingerprint.toByteArray())) {
        throw CertificateException("Fingerprint TLS divergente.")
      }
    }
  }

  private fun sha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  private fun readMessage(input: InputStream): Pair<String, JSONObject> {
    val line = readLine(input)
    val separator = line.indexOf(' ')
    if (separator <= 0) throw IllegalStateException("Mensagem FD/01 inválida.")
    val command = line.substring(0, separator)
    val json = try { JSONObject(line.substring(separator + 1)) }
      catch (error: Exception) { throw IllegalStateException("JSON FD/01 inválido.", error) }
    return command to json
  }

  private fun readLine(input: InputStream): String {
    val bytes = ByteArrayOutputStream()
    while (true) {
      val value = input.read()
      if (value < 0) throw java.io.EOFException("Ligação encerrada pelo Windows.")
      if (value == '\n'.code) break
      if (value != '\r'.code) bytes.write(value)
      if (bytes.size() > MAX_LINE_BYTES) throw IllegalStateException("Mensagem FD/01 demasiado grande.")
    }
    return bytes.toString(Charsets.UTF_8.name())
  }

  private fun writeMessage(output: java.io.OutputStream, command: String, json: JSONObject) {
    writeLine(output, command + " " + json.toString())
  }

  private fun writeLine(output: java.io.OutputStream, line: String) {
    val bytes = (line + "\n").toByteArray(Charsets.UTF_8)
    if (bytes.size > MAX_LINE_BYTES) throw IllegalStateException("Mensagem FD/01 demasiado grande.")
    output.write(bytes); output.flush()
  }

  private fun readExactly(input: InputStream, buffer: ByteArray) {
    var read = 0
    while (read < buffer.size) {
      val count = input.read(buffer, read, buffer.size - read)
      if (count < 0) throw java.io.EOFException("Ligação interrompida durante um chunk.")
      if (count > 0) read += count
    }
  }

  private fun skipExactly(input: InputStream, bytesToSkip: Long) {
    var remaining = bytesToSkip
    val buffer = ByteArray(64 * 1024)
    while (remaining > 0) {
      val skipped = input.skip(remaining)
      if (skipped > 0) remaining -= skipped
      else {
        val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
        if (read < 0) throw java.io.EOFException("Não foi possível retomar a partir do offset guardado.")
        if (read > 0) remaining -= read
      }
    }
  }

  private fun sendProgress(status: String, transferId: String, sentBytes: Long, totalBytes: Long, currentFile: String, message: String) {
    sendEvent(PROGRESS_EVENT, mapOf(
      "status" to status, "transferId" to transferId, "sentBytes" to sentBytes,
      "totalBytes" to totalBytes, "currentFile" to currentFile, "message" to message
    ))
  }
}
