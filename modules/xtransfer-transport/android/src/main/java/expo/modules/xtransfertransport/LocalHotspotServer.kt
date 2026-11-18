package expo.modules.xtransfertransport

import android.content.Context
import android.net.Uri
import android.os.Environment
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

internal data class HostFile(val uri: Uri, val name: String, val size: Long, val mimeType: String)

internal class LocalHotspotServer(private val context: Context) {
  private val running = AtomicBoolean(false)
  private val executor: ExecutorService = Executors.newCachedThreadPool()
  private var socket: ServerSocket? = null
  private var files: List<HostFile> = emptyList()
  var token: String = ""
    private set

  fun start(): Int {
    if (running.get()) return socket?.localPort ?: 0
    token = java.util.UUID.randomUUID().toString().replace("-", "").take(12).uppercase()
    socket = ServerSocket(0).also { it.reuseAddress = true }
    running.set(true)
    val server = socket ?: error("Servidor local indisponível.")
    executor.execute {
      while (running.get()) {
        try { executor.execute { handle(server.accept()) } }
        catch (_: Exception) { if (running.get()) continue }
      }
    }
    return server.localPort
  }

  fun stop() {
    running.set(false)
    try { socket?.close() } catch (_: Exception) { }
    socket = null
  }

  fun setFiles(next: List<HostFile>) { files = next }

  fun isRunning(): Boolean = running.get()

  fun port(): Int = socket?.localPort ?: 0

  fun downloadDirectory(): File {
    val directory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
      ?: context.filesDir
    return File(directory, "XTransfer Offline").also { it.mkdirs() }
  }

  private fun handle(client: Socket) {
    client.use { connection ->
      connection.soTimeout = 30_000
      val input = BufferedInputStream(connection.getInputStream())
      val output = BufferedOutputStream(connection.getOutputStream())
      try {
        val requestLine = readLine(input) ?: return
        val headers = linkedMapOf<String, String>()
        while (true) {
          val line = readLine(input) ?: return
          if (line.isEmpty()) break
          val separator = line.indexOf(':')
          if (separator > 0) headers[line.substring(0, separator).trim().lowercase()] = line.substring(separator + 1).trim()
          if (headers.size > 40) throw IllegalArgumentException("Headers demasiado grandes.")
        }
        val pieces = requestLine.split(' ')
        if (pieces.size < 2) return
        val method = pieces[0]
        val target = pieces[1]
        val path = target.substringBefore('?')
        val query = parseQuery(target.substringAfter('?', ""))
        if (query["token"] != token && headers["x-xtransfer-token"] != token) {
          respond(output, 401, "text/plain; charset=utf-8", "Código local inválido.")
          return
        }
        when {
          method == "GET" && path == "/" -> respond(output, 200, "text/html; charset=utf-8", renderHome())
          method == "GET" && path == "/health" -> respond(output, 200, "application/json", "{\"ok\":true,\"name\":\"XTransfer Offline\"}")
          method == "GET" && path == "/download" -> download(output, query["index"]?.toIntOrNull())
          method == "POST" && path == "/upload" -> upload(input, output, headers, query["name"] ?: "ficheiro-recebido")
          else -> respond(output, 404, "text/plain; charset=utf-8", "Rota não encontrada.")
        }
      } catch (error: Exception) {
        try { respond(output, 400, "text/plain; charset=utf-8", error.message ?: "Pedido inválido.") } catch (_: Exception) { }
      }
    }
  }

  private fun download(output: BufferedOutputStream, index: Int?) {
    val item = index?.let { files.getOrNull(it) } ?: throw IllegalArgumentException("Ficheiro inexistente.")
    val input = context.contentResolver.openInputStream(item.uri) ?: throw IllegalArgumentException("Não foi possível abrir o ficheiro.")
    input.use { stream ->
      val header = "HTTP/1.1 200 OK\r\nContent-Type: ${safeHeader(item.mimeType)}\r\nContent-Length: ${item.size}\r\nContent-Disposition: attachment; filename=\"${safeHeader(item.name)}\"\r\nConnection: close\r\n\r\n"
      output.write(header.toByteArray(Charsets.UTF_8))
      val buffer = ByteArray(64 * 1024)
      var remaining = item.size
      while (remaining > 0) {
        val count = stream.read(buffer, 0, min(buffer.size.toLong(), remaining).toInt())
        if (count < 0) throw IllegalStateException("O ficheiro mudou durante a leitura.")
        output.write(buffer, 0, count)
        remaining -= count
      }
      output.flush()
    }
  }

  private fun upload(input: BufferedInputStream, output: BufferedOutputStream, headers: Map<String, String>, name: String) {
    val length = headers["content-length"]?.toLongOrNull() ?: throw IllegalArgumentException("O PC não informou o tamanho.")
    if (length < 0 || length > 100L * 1024 * 1024 * 1024) throw IllegalArgumentException("Ficheiro demasiado grande.")
    val safeName = safeFileName(URLDecoder.decode(name, "UTF-8"))
    val target = uniqueFile(downloadDirectory(), safeName)
    target.outputStream().use { file ->
      val buffer = ByteArray(64 * 1024)
      var remaining = length
      while (remaining > 0) {
        val count = input.read(buffer, 0, min(buffer.size.toLong(), remaining).toInt())
        if (count < 0) throw IllegalStateException("Upload interrompido.")
        file.write(buffer, 0, count)
        remaining -= count
      }
    }
    respond(output, 201, "application/json", "{\"name\":\"${safeHeader(target.name)}\",\"path\":\"${safeHeader(target.absolutePath)}\"}")
  }

  private fun renderHome(): String {
    val list = files.mapIndexed { index, item ->
      "<li><strong>${escape(item.name)}</strong> <small>${item.size} bytes</small> <a href=\"/download?index=$index&token=$token\">Descarregar</a></li>"
    }.joinToString("")
    return """<!doctype html><html lang="pt"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XTransfer Offline</title><style>body{font:16px system-ui;max-width:720px;margin:32px auto;padding:0 18px;color:#182018}button{background:#d8f36a;border:0;padding:12px 18px;border-radius:10px;font-weight:700}li{margin:14px 0}small{color:#6f756b}</style><h1>XTransfer Offline</h1><p>Ligação local. Sem nuvem. Código válido apenas para esta sessão.</p><h2>Ficheiros no telefone</h2><ul>$list</ul><h2>Enviar para o telefone</h2><form id="f"><input id="i" type="file" multiple><button>Enviar</button></form><p id="s"></p><script>f.onsubmit=async e=>{e.preventDefault();for(const x of i.files){s.textContent='A enviar '+x.name;await fetch('/upload?name='+encodeURIComponent(x.name)+'&token=$token',{method:'POST',headers:{'Content-Length':x.size,'X-XTransfer-Token':'$token'},body:x});}s.textContent='Concluído';location.reload()}</script></html>"""
  }

  private fun respond(output: BufferedOutputStream, status: Int, contentType: String, body: String) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    output.write("HTTP/1.1 $status ${if (status < 300) "OK" else "Error"}\r\nContent-Type: $contentType\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray(Charsets.UTF_8))
    output.write(bytes); output.flush()
  }

  private fun readLine(input: BufferedInputStream): String? {
    val bytes = ArrayList<Byte>(128)
    while (bytes.size < 16 * 1024) {
      val value = input.read()
      if (value < 0) return if (bytes.isEmpty()) null else throw IllegalStateException("Pedido incompleto.")
      if (value == '\n'.code) break
      if (value != '\r'.code) bytes.add(value.toByte())
    }
    if (bytes.size >= 16 * 1024) throw IllegalArgumentException("Linha HTTP demasiado grande.")
    return bytes.toByteArray().toString(Charsets.UTF_8)
  }

  private fun parseQuery(raw: String): Map<String, String> = raw.split('&').filter { it.contains('=') }.associate {
    val key = URLDecoder.decode(it.substringBefore('='), "UTF-8")
    val value = URLDecoder.decode(it.substringAfter('='), "UTF-8")
    key to value
  }

  private fun safeFileName(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isBlank() || trimmed.length > 255 || trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') || trimmed != File(trimmed).name || trimmed.any { it.isISOControl() }) throw IllegalArgumentException("Nome de ficheiro inválido.")
    return trimmed
  }

  private fun uniqueFile(directory: File, name: String): File {
    val safe = safeFileName(name)
    var result = File(directory, safe)
    var count = 1
    while (result.exists()) { result = File(directory, "${File(safe).nameWithoutExtension}-$count.${File(safe).extension}"); count++ }
    return result
  }

  private fun safeHeader(value: String): String = value.replace("\r", "").replace("\n", "").replace("\"", "")
  private fun escape(value: String): String = safeHeader(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
}
