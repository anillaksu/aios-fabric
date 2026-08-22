package com.aios.nodeagent

import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets

/**
 * Minimal raw-socket HTTP server serving GET /.well-known/agent-card.json,
 * matching fabric/src/a2a.ts's AgentCard shape exactly (name, description, url,
 * version, protocolVersion, supportedInterfaces, capabilities, skills) — no new
 * protocol, no new port convention beyond "a different port than the existing
 * Termux-based Xiaomi agent on 9300" (see docs/android-foundation/
 * 08-VERTICAL-SLICE-STATUS.md for why 9300 is already occupied by the prior
 * PWA/browser-node agent, which this does not replace).
 */
class AgentCardServer(private val port: Int = 9301) {
    @Volatile private var server: ServerSocket? = null
    @Volatile private var running = false

    fun start() {
        if (running) return
        running = true
        Thread {
            try {
                val s = ServerSocket(port)
                server = s
                while (running) {
                    try {
                        val client = s.accept()
                        Thread { handle(client) }.also { it.isDaemon = true; it.start() }
                    } catch (_: Exception) {
                        if (running) { /* transient accept error, keep looping */ }
                    }
                }
            } catch (_: Exception) {
                running = false
            }
        }.also { it.isDaemon = true; it.start() }
    }

    fun stop() {
        running = false
        try { server?.close() } catch (_: Exception) {}
    }

    private fun handle(client: Socket) {
        client.use { sock ->
            val reader = BufferedReader(InputStreamReader(sock.getInputStream(), StandardCharsets.UTF_8))
            val requestLine = reader.readLine() ?: return
            val path = requestLine.split(" ").getOrNull(1) ?: "/"

            val (status, body) = if (path == "/.well-known/agent-card.json") {
                "200 OK" to agentCardJson()
            } else {
                "404 Not Found" to """{"error":"not found"}"""
            }
            val bodyBytes = body.toByteArray(StandardCharsets.UTF_8)
            val response = "HTTP/1.1 $status\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${bodyBytes.size}\r\n" +
                "Connection: close\r\n\r\n"
            sock.getOutputStream().write(response.toByteArray(StandardCharsets.UTF_8))
            sock.getOutputStream().write(bodyBytes)
            sock.getOutputStream().flush()
        }
    }

    private fun agentCardJson(): String {
        val nodeId = RuntimeState.nodeId
        val caps = RuntimeState.capabilities.values
            .filter { it.status == CapabilityStatus.TESTED }
            .map { """{"id":"${it.capability}","name":"${it.capability}","description":"Device capability (risk: safe) - device-proven"}""" }
            .joinToString(",")
        return """
        {
          "name": "AIOS Node Agent (Android native, vertical slice)",
          "description": "Native AIOS Node Agent running on-device via JNI over aios_core_native. Separate from the existing Termux/PWA agent on port 9300 - not a replacement.",
          "url": "http://127.0.0.1:$port",
          "version": "0.2.0-vertical-slice",
          "protocolVersion": "1.0",
          "supportedInterfaces": [{"transport": "http+json", "url": "http://127.0.0.1:$port"}],
          "capabilities": {"streaming": false, "pushNotifications": false},
          "skills": [$caps],
          "nodeId": "$nodeId",
          "platform": "android",
          "attestationStatus": "NOT_IMPLEMENTED"
        }
        """.trimIndent()
    }
}
