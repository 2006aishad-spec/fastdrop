package expo.modules.xtransfertransport

import android.content.ContentValues
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.security.KeyPairGeneratorSpec
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.math.BigInteger
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.Calendar
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.SSLSocket
import javax.security.auth.x500.X500Principal

/**
 * Native FD/01 receiver. It accepts only local-network TLS connections and writes
 * incoming files to app-private partial storage before publishing verified files
 * into the public Downloads collection (Android 10+) or app Downloads folder.
 */
internal class AndroidReceiveServer(
  private val context: Context,
  private val onProgress: (Map<String, Any>) -> Unit
) {
  companion object {
    const val PORT = 45557
    private const val GROUP = "239.255.42.42"
    private const val DISCOVERY_PORT = 45555
    private const val MAX_LINE = 64 * 1024
    private const val MAX_CHUNK = 1024 * 1024
    private const val MAX_FILES = 1000
    private const val MAX_FILE_BYTES = 100L * 1024 * 1024 * 1024
    private const val MAX_SESSION_BYTES = 500L * 1024 * 1024 * 1024
    private const val KEY_ALIAS = "xtransfer-offline-device-tls"
    private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  }

  data class SessionInfo(val code: String, val port: Int, val fingerprint: String)

  private val running = AtomicBoolean(false)
  private val random = SecureRandom()
  @Volatile private var listener: SSLServerSocket? = null
  @Volatile private var code = ""
  @Volatile private var expiresAt = 0L
  @Volatile private var consumed = false
  @Volatile private var pairingFailures = 0
  @Volatile private var blockedUntil = 0L
  @Volatile private var fingerprint = ""
  @Volatile private var deviceId = ""
  private var serverThread: Thread? = null
  private var announceThread: Thread? = null
  private var multicastLock: WifiManager.MulticastLock? = null

  fun start(): SessionInfo {
    if (!running.compareAndSet(false, true)) {
      return SessionInfo(code, PORT, fingerprint)
    }
    try {
      deviceId = stableDeviceId()
      val tls = createServerTls()
      fingerprint = tls.second
      code = createPairingCode()
      expiresAt = System.currentTimeMillis() + 5 * 60 * 1000L
      consumed = false
      pairingFailures = 0
      blockedUntil = 0L

      val server = tls.first.serverSocketFactory.createServerSocket(
        PORT, 8, InetAddress.getByName("0.0.0.0")
      ) as SSLServerSocket
      server.enabledProtocols = server.supportedProtocols
        .filter { it == "TLSv1.2" || it == "TLSv1.3" }.toTypedArray()
      server.soTimeout = 1000
      listener = server

      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      multicastLock = wifi.createMulticastLock("xtransfer-offline-android-receiver").apply {
        setReferenceCounted(false)
        acquire()
      }

      serverThread = Thread({ acceptLoop(server) }, "xtransfer-android-tls").apply { isDaemon = true; start() }
      announceThread = Thread({ announceLoop() }, "xtransfer-android-discovery").apply { isDaemon = true; start() }
      return SessionInfo(code, PORT, fingerprint)
    } catch (error: Exception) {
      stop()
      throw error
    }
  }

  fun stop() {
    running.set(false)
    try { listener?.close() } catch (_: Exception) { }
    listener = null
    try { multicastLock?.let { if (it.isHeld) it.release() } } catch (_: Exception) { }
    multicastLock = null
    serverThread?.interrupt()
    announceThread?.interrupt()
    serverThread = null
    announceThread = null
  }

  private fun stableDeviceId(): String {
    val prefs = context.getSharedPreferences("xtransfer-offline", Context.MODE_PRIVATE)
    val old = prefs.getString("device_id", null)
    if (!old.isNullOrBlank()) return old
    val created = "android-" + UUID.randomUUID().toString()
    prefs.edit().putString("device_id", created).apply()
    return created
  }

  private fun createPairingCode(): String {
    val bytes = ByteArray(6)
    random.nextBytes(bytes)
    return buildString(6) { bytes.forEach { append(ALPHABET[(it.toInt() and 0xff) % ALPHABET.length]) } }
  }

  private fun createServerTls(): Pair<SSLContext, String> {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!store.containsAlias(KEY_ALIAS)) {
      val start = Calendar.getInstance()
      val end = Calendar.getInstance().apply { add(Calendar.YEAR, 2) }
      val spec = KeyPairGeneratorSpec.Builder(context)
        .setAlias(KEY_ALIAS)
        .setSubject(X500Principal("CN=XTransfer Offline Android"))
        .setSerialNumber(BigInteger.valueOf(System.currentTimeMillis()))
        .setStartDate(start.time)
        .setEndDate(end.time)
        .build()
      KeyPairGenerator.getInstance("RSA", "AndroidKeyStore").apply {
        initialize(spec)
        generateKeyPair()
      }
    }
    store.load(null)
    val cert = store.getCertificate(KEY_ALIAS) as? X509Certificate
      ?: throw IllegalStateException("Não foi possível obter o certificado TLS do Android.")
    cert.checkValidity()
    val fingerprintValue = sha256(cert.encoded)
    val keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply {
      init(store, null)
    }.keyManagers
    val ssl = SSLContext.getInstance("TLS").apply { init(keyManagers, null, random) }
    return ssl to fingerprintValue
  }

  private fun announceLoop() {
    try {
      DatagramSocket().use { socket ->
        socket.broadcast = true
        val group = InetAddress.getByName(GROUP)
        while (running.get()) {
          if (!consumed && System.currentTimeMillis() >= expiresAt) {
            code = createPairingCode()
            expiresAt = System.currentTimeMillis() + 5 * 60 * 1000L
            pairingFailures = 0
            blockedUntil = 0L
            onProgress(progressMap("ready", "", 0L, 0L, "", "O código expirou. Um novo código está disponível.")
              .plus("pairingCode" to code))
          }
          val announcement = JSONObject()
            .put("deviceId", deviceId)
            .put("deviceName", (Build.MODEL ?: "Android").take(80))
            .put("platform", "Android")
            .put("protocolVersion", "FD/01")
            .put("nonce", UUID.randomUUID().toString().replace("-", ""))
            .put("transferPort", PORT)
            .put("certificateSha256", fingerprint)
          val data = announcement.toString().toByteArray(Charsets.UTF_8)
          socket.send(DatagramPacket(data, data.size, group, DISCOVERY_PORT))
          try { Thread.sleep(3000L) } catch (_: InterruptedException) { break }
        }
      }
    } catch (error: Exception) {
      if (running.get()) Log.w("XTransferOffline", "Falha no anúncio local", error)
    }
  }

  private fun acceptLoop(server: SSLServerSocket) {
    while (running.get()) {
      var client: SSLSocket? = null
      try {
        client = server.accept() as SSLSocket
        if (!isPrivateAddress(client.inetAddress)) {
          try { client.close() } catch (_: Exception) { }
          client = null
          continue
        }
        client.soTimeout = 30_000
        client.tcpNoDelay = true
        client.enabledProtocols = client.supportedProtocols
          .filter { it == "TLSv1.2" || it == "TLSv1.3" }.toTypedArray()
        client.startHandshake()
        handleClient(client)
      } catch (_: SocketTimeoutException) {
        // Poll running flag.
      } catch (_: SocketException) {
        if (running.get()) Log.w("XTransferOffline", "Socket de receção fechado.")
      } catch (error: Exception) {
        if (running.get()) Log.w("XTransferOffline", "Ligação recebida rejeitada: ${error.message}")
      } finally {
        try { client?.close() } catch (_: Exception) { }
        if (running.get() && client != null && consumed) {
          code = createPairingCode()
          expiresAt = System.currentTimeMillis() + 5 * 60 * 1000L
          consumed = false
          pairingFailures = 0
          blockedUntil = 0L
          onProgress(progressMap("ready", "", 0L, 0L, "", "Novo código de emparelhamento disponível.")
            .plus("pairingCode" to code))
        }
      }
    }
  }

  private fun handleClient(socket: SSLSocket) {
    val remote = socket.inetAddress ?: return
    if (!isPrivateAddress(remote)) throw SecurityException("A origem não pertence à rede local.")
    val input = BufferedInputStream(socket.inputStream)
    val output = socket.outputStream
    val pair = readMessage(input, "PAIR")
    val senderId = pair.optString("deviceId")
    val submittedCode = pair.optString("code").uppercase()
    val nonce = pair.optString("nonce")
    val now = System.currentTimeMillis()
    if (now < blockedUntil) {
      writeMessage(output, "PAIR_REJECTED", JSONObject().put("message", "Demasiadas tentativas. Aguarda antes de tentar novamente."))
      return
    }
    if (senderId.isBlank() || senderId.length > 128 || nonce.isBlank() || nonce.length > 128 ||
      now >= expiresAt || consumed || !constantTimeEquals(code, submittedCode)) {
      pairingFailures += 1
      if (pairingFailures >= 5) {
        blockedUntil = now + 60_000L
        pairingFailures = 0
      }
      writeMessage(output, "PAIR_REJECTED", JSONObject().put("message", "Código incorreto, expirado ou já utilizado."))
      return
    }

    pairingFailures = 0
    consumed = true
    val sessionId = UUID.randomUUID().toString().replace("-", "")
    val token = ByteArray(32).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    writeMessage(output, "PAIR_ACCEPTED", JSONObject()
      .put("accepted", true).put("sessionId", sessionId).put("code", submittedCode)
      .put("message", "Emparelhamento aceite.").put("token", token))

    val auth = readMessage(input, "AUTH")
    if (auth.optString("sessionId") != sessionId || !constantTimeEquals(token, auth.optString("token"))) {
      writeMessage(output, "ERROR", JSONObject().put("message", "Sessão não autorizada."))
      return
    }

    val manifest = readMessage(input, "MANIFEST")
    if (manifest.optString("sessionId") != sessionId || manifest.optString("deviceId") != senderId) {
      throw SecurityException("Sessão ou dispositivo do manifesto divergente.")
    }
    val transferId = manifest.optString("transferId")
    if (!validId(transferId)) throw IllegalArgumentException("Identificador de transferência inválido.")
    val files = manifest.optJSONArray("files") ?: throw IllegalArgumentException("Manifesto sem ficheiros.")
    if (files.length() !in 1..MAX_FILES) throw IllegalArgumentException("Quantidade de ficheiros inválida.")
    val entries = linkedMapOf<String, FileEntry>()
    var total = 0L
    for (i in 0 until files.length()) {
      val item = files.getJSONObject(i)
      val id = item.optString("fileId")
      val name = item.optString("name")
      val size = item.optLong("size", -1)
      val hash = item.optString("sha256").lowercase()
      if (!validId(id) || entries.containsKey(id) || !validFileName(name) ||
        size < 0 || size > MAX_FILE_BYTES || !hash.matches(Regex("^[a-f0-9]{64}$")) ||
        Long.MAX_VALUE - total < size) throw IllegalArgumentException("Entrada de ficheiro inválida.")
      total += size
      entries[id] = FileEntry(id, name, size, hash, item.optString("kind", "document"))
    }
    if (total > MAX_SESSION_BYTES) throw IllegalArgumentException("A transferência excede 500 GB.")
    writeMessage(output, "MANIFEST_ACCEPTED", JSONObject().put("sessionId", sessionId))
    val folder = File(context.filesDir, "xtransfer-receive/$transferId").apply { mkdirs() }
    var received = 0L
    var currentFile: String? = null
    var cancelled = false
    val completedIds = mutableSetOf<String>()
    onProgress(progressMap("receiving", transferId, received, total, "", "A receber ficheiros do Windows."))

    while (running.get()) {
      val line = readLine(input) ?: break
      when {
        line.startsWith("FILE_BEGIN ") -> {
          val begin = JSONObject(line.substring(11))
          val id = begin.optString("fileId")
          val entry = entries[id] ?: throw IllegalArgumentException("Ficheiro não pertence ao manifesto.")
          currentFile = id
          val part = partFile(folder, id)
          val marker = doneFile(folder, id)
          val alreadyComplete = marker.exists() && marker.readText().trim() == entry.sha256
          if (part.length() > entry.size) part.delete()
          val offset = if (alreadyComplete) entry.size else if (part.exists()) part.length() else 0L
          writeMessage(output, "RESUME", JSONObject().put("fileId", id).put("offset", offset))
        }
        line.startsWith("CHUNK ") -> {
          val header = JSONObject(line.substring(6))
          val id = header.optString("fileId")
          val entry = entries[id] ?: throw IllegalArgumentException("Ficheiro não pertence ao manifesto.")
          if (currentFile != id) throw IllegalArgumentException("FILE_BEGIN obrigatório antes do CHUNK.")
          val offset = header.optLong("offset", -1)
          val length = header.optInt("length", -1)
          val expectedHash = header.optString("sha256").lowercase()
          val part = partFile(folder, id)
          val currentLength = if (part.exists()) part.length() else 0L
          if (offset != currentLength || length !in 1..MAX_CHUNK || offset < 0 ||
            offset > entry.size || length.toLong() > entry.size - offset ||
            !expectedHash.matches(Regex("^[a-f0-9]{64}$"))) throw IllegalArgumentException("Chunk ou offset inválido.")
          val bytes = ByteArray(length)
          readExactly(input, bytes)
          if (!constantTimeEquals(sha256(bytes), expectedHash)) throw SecurityException("SHA-256 do chunk divergente.")
          FileOutputStream(part, true).use { stream -> stream.write(bytes); stream.fd.sync() }
          received += length
          writeMessage(output, "ACK", JSONObject().put("fileId", id).put("offset", offset + length))
          onProgress(progressMap("receiving", transferId, received, total, entry.name, "Bloco recebido e confirmado."))
        }
        line.startsWith("FILE_END ") -> {
          val end = JSONObject(line.substring(9))
          val id = end.optString("fileId")
          val entry = entries[id] ?: throw IllegalArgumentException("Ficheiro não pertence ao manifesto.")
          if (currentFile != id) throw IllegalArgumentException("FILE_BEGIN obrigatório antes de FILE_END.")
          if (end.optString("sha256").lowercase() != entry.sha256) throw SecurityException("Hash final do manifesto divergente.")
          val part = partFile(folder, id)
          val marker = doneFile(folder, id)
          val alreadyComplete = marker.exists() && marker.readText().trim() == entry.sha256
          if (!alreadyComplete) {
            if (!part.exists() && entry.size == 0L) part.createNewFile()
            if (!part.exists() || part.length() != entry.size || !constantTimeEquals(hashFile(part), entry.sha256)) {
              throw SecurityException("SHA-256 final ou tamanho divergente.")
            }
            publishToDownloads(part, entry)
            marker.writeText(entry.sha256)
            part.delete()
          }
          completedIds.add(id)
          writeMessage(output, "FILE_COMPLETE", JSONObject().put("fileId", id).put("name", entry.name))
          onProgress(progressMap("file-complete", transferId, received, total, entry.name, "Ficheiro verificado e guardado."))
          currentFile = null
        }
        line == "CANCEL" || line.startsWith("CANCEL ") -> {
          folder.listFiles()?.forEach { try { it.delete() } catch (_: Exception) { } }
          cancelled = true
          writeMessage(output, "CANCELLED", JSONObject().put("transferId", transferId))
          onProgress(progressMap("cancelled", transferId, received, total, "", "Transferência cancelada pelo Windows."))
          break
        }
        else -> throw IllegalArgumentException("Comando FD/01 desconhecido.")
      }
    }
    if (running.get() && !cancelled && completedIds.size == entries.size) {
      onProgress(progressMap("completed", transferId, total, total, "", "Todos os ficheiros foram verificados e guardados."))
    } else if (running.get() && !cancelled) {
      onProgress(progressMap("paused", transferId, received, total, "", "Ligação encerrada. Os blocos confirmados foram preservados para retoma."))
    }
  }

  private fun publishToDownloads(part: File, entry: FileEntry) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, entry.name)
        put(MediaStore.Downloads.MIME_TYPE, mimeFor(entry.kind, entry.name))
        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/XTransfer Offline")
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Não foi possível criar o ficheiro na pasta Transferências.")
      try {
        context.contentResolver.openOutputStream(uri, "w").use { output ->
          if (output == null) throw IllegalStateException("Não foi possível abrir o destino.")
          FileInputStream(part).use { it.copyTo(output, 128 * 1024) }
          output.flush()
        }
        val ready = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
        context.contentResolver.update(uri, ready, null, null)
      } catch (error: Exception) {
        try { context.contentResolver.delete(uri, null, null) } catch (_: Exception) { }
        throw error
      }
    } else {
      val directory = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "XTransfer Offline")
      if (!directory.exists() && !directory.mkdirs()) throw IllegalStateException("Não foi possível criar a pasta de destino.")
      var target = File(directory, entry.name)
      if (target.exists()) target = File(directory, "${System.currentTimeMillis()}-${entry.name}")
      part.copyTo(target, overwrite = false)
    }
  }

  private fun mimeFor(kind: String, name: String): String {
    val ext = name.substringAfterLast('.', "").lowercase()
    return when (kind) {
      "image" -> "image/*"
      "video" -> "video/*"
      "audio" -> "audio/*"
      else -> when (ext) {
        "pdf" -> "application/pdf"
        "zip" -> "application/zip"
        "txt" -> "text/plain"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else -> "application/octet-stream"
      }
    }
  }

  private fun partFile(folder: File, id: String): File {
    if (!validId(id)) throw IllegalArgumentException("ID de ficheiro inválido.")
    val file = File(folder, "$id.part").canonicalFile
    if (file.parentFile != folder.canonicalFile) throw SecurityException("Caminho de ficheiro inválido.")
    return file
  }

  private fun doneFile(folder: File, id: String): File {
    if (!validId(id)) throw IllegalArgumentException("ID de ficheiro inválido.")
    val file = File(folder, "$id.done").canonicalFile
    if (file.parentFile != folder.canonicalFile) throw SecurityException("Caminho de marcador inválido.")
    return file
  }

  private fun validId(value: String) = value.matches(Regex("^[A-Za-z0-9_-]{8,128}$"))
  private fun validFileName(value: String): Boolean =
    value.isNotBlank() && value.length <= 255 && value != "." && value != ".." &&
      !value.contains('/') && !value.contains('\\') && value.none { it.isISOControl() }

  private fun isPrivateAddress(address: InetAddress): Boolean {
    if (address.isLoopbackAddress) return true
    if (address.address.size != 4) return address.isLinkLocalAddress || address.isSiteLocalAddress
    val b = address.address.map { it.toInt() and 0xff }
    return b[0] == 10 || (b[0] == 172 && b[1] in 16..31) ||
      (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254)
  }

  private fun constantTimeEquals(a: String, b: String): Boolean {
    val left = a.toByteArray(Charsets.UTF_8)
    val right = b.toByteArray(Charsets.UTF_8)
    return left.size == right.size && MessageDigest.isEqual(left, right)
  }

  private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it.toInt() and 0xff) }

  private fun hashFile(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(128 * 1024)
      while (true) {
        val n = input.read(buffer)
        if (n < 0) break
        if (n > 0) digest.update(buffer, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun readMessage(input: InputStream, expected: String): JSONObject {
    val line = readLine(input) ?: throw java.io.EOFException("Ligação encerrada.")
    if (!line.startsWith(expected + " ")) throw IllegalArgumentException("Esperado $expected.")
    return JSONObject(line.substring(expected.length + 1))
  }

  private fun readLine(input: InputStream): String? {
    val bytes = ByteArrayOutputStream()
    while (true) {
      val value = input.read()
      if (value < 0) return if (bytes.size() == 0) null else throw java.io.EOFException("Linha incompleta.")
      if (value == 10) break
      if (value != 13) bytes.write(value)
      if (bytes.size() > MAX_LINE) throw IllegalArgumentException("Mensagem demasiado grande.")
    }
    return bytes.toString(Charsets.UTF_8.name())
  }

  private fun readExactly(input: InputStream, bytes: ByteArray) {
    var offset = 0
    while (offset < bytes.size) {
      val count = input.read(bytes, offset, bytes.size - offset)
      if (count < 0) throw java.io.EOFException("Ligação interrompida durante um chunk.")
      if (count > 0) offset += count
    }
  }

  private fun writeMessage(output: OutputStream, command: String, json: JSONObject) {
    val bytes = (command + " " + json.toString() + "\n").toByteArray(Charsets.UTF_8)
    if (bytes.size > MAX_LINE) throw IllegalArgumentException("Mensagem demasiado grande.")
    output.write(bytes)
    output.flush()
  }

  private fun progressMap(status: String, id: String, sent: Long, total: Long, current: String, message: String) =
    mapOf("status" to status, "transferId" to id, "sentBytes" to sent, "totalBytes" to total, "currentFile" to current, "message" to message)

  private data class FileEntry(val id: String, val name: String, val size: Long, val sha256: String, val kind: String)
}
