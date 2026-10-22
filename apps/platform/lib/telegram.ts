/**
 * Minimal Telegram Bot API client. We only need a handful of methods, so we
 * call the HTTP API directly instead of pulling in a dependency.
 */

import { providerBaseUrls } from "./env";

const API = providerBaseUrls.TELEGRAM_API_BASE_URL;

function token(): string {
    const t = process.env.TELEGRAM_BOT_TOKEN;
    if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    return t;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API}/bot${token()}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
        throw new Error(`Telegram ${method} failed: ${json.description || res.status}`);
    }
    return json.result as T;
}

export async function sendMessage(
    chatId: number,
    text: string,
    extra: Record<string, unknown> = {}
) {
    return call<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...extra,
    });
}

export async function editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    extra: Record<string, unknown> = {}
) {
    return call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        ...extra,
    });
}

export async function answerCallbackQuery(
    callbackQueryId: string,
    text?: string
) {
    return call("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
    });
}

/** Resolve a file_id to a downloadable URL, then fetch its bytes. */
export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const file = await call<{ file_path: string }>("getFile", { file_id: fileId });
    const url = `${API}/file/bot${token()}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();

    // Telegram serves files with Content-Type: application/octet-stream, which
    // Gemini rejects. Infer the MIME from the file_path extension instead.
    const ext = file.file_path.split(".").pop()?.toLowerCase() || "";
    const mimeByExt: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heif",
        gif: "image/gif",
    };
    const mimeType = mimeByExt[ext] || "image/jpeg";

    return { buffer: Buffer.from(arrayBuffer), mimeType };
}
