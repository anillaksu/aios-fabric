// AIOS Outbound A2A Client (Windows -> Android Reference Node)
import { randomUUID } from "node:crypto";

const DEFAULT_ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";

/**
 * A2A v1.0 JSON-RPC SendMessage giden istemci köprüsü.
 * Token yalnızca bellekte (AIOS_PHONE_A2A_TOKEN) tutulur; diske yazılmaz, loglanmaz.
 */
export async function sendA2AMessage(options = {}) {
  const host = options.host || DEFAULT_ANDROID_HOST;
  const text = options.text || "";
  const token = (options.token || process.env.AIOS_PHONE_A2A_TOKEN || "").trim();
  const timeoutMs = Number(options.timeoutMs || 30000);

  if (!text) {
    return { ok: false, error: "MESSAGE_TEXT_REQUIRED" };
  }

  // Fail-closed kimlik doğrulama kapısı
  if (!token) {
    return {
      ok: false,
      error: "A2A_PHONE_AUTH_MISSING",
      code: "AUTH_MISSING",
      detail: "AIOS_PHONE_A2A_TOKEN ortam değişkeni tanımlı değil. Fail-closed duruldu.",
    };
  }

  const rpcId = "rpc-" + randomUUID().slice(0, 8);
  const messageId = "msg-" + randomUUID();
  const contextId = options.contextId || "ctx-" + randomUUID();

  const payload = {
    jsonrpc: "2.0",
    id: rpcId,
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        parts: [{ text, mediaType: "text/plain" }],
        messageId,
        contextId,
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(host, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        error: "A2A_AUTH_FAILED",
        detail: "Android node Bearer tokeni reddetti (HTTP 401).",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP_ERROR_${res.status}`,
      };
    }

    const body = await res.json();
    if (body.error) {
      return {
        ok: false,
        status: res.status,
        error: body.error.message || "A2A_RPC_ERROR",
        code: body.error.code,
      };
    }

    // A2A v1.0 yanıt metnini ayıkla (artifacts -> status.message -> message)
    const task = body.result?.task || body.result?.message || body.result || {};
    let reply = "";
    if (Array.isArray(task.artifacts) && task.artifacts[0]?.parts?.[0]?.text) {
      reply = task.artifacts[0].parts[0].text;
    } else if (task.status?.message?.parts?.[0]?.text) {
      reply = task.status.message.parts[0].text;
    } else if (Array.isArray(task.history)) {
      const last = task.history[task.history.length - 1];
      reply = last?.parts?.[0]?.text || "";
    } else if (typeof task.reply === "string") {
      reply = task.reply;
    }

    return {
      ok: true,
      status: res.status,
      taskId: task.id || rpcId,
      state: task.status?.state || task.state || "COMPLETED",
      reply: reply.trim(),
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: isTimeout ? "A2A_TIMEOUT" : "A2A_NETWORK_ERROR",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
