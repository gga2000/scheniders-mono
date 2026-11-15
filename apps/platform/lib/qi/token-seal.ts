import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Saved Qi card tokens are stored only sealed with AES-256-GCM, as Qi's
 * tokenization guide requires: a fresh random 12-byte IV per seal, the IV and
 * the 16-byte tag stored with the ciphertext, the key kept out of the database
 * (QI_TOKEN_KEY in the server env), and a token whose tag does not check is
 * refused. The store's id is bound in as associated data, so a sealed token
 * copied onto another store's row does not open.
 *
 * Format: "v1." + base64url(iv | tag | ciphertext).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A sealed token that does not open: wrong key, wrong store, or changed. */
export class QiTokenSealError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "QiTokenSealError";
    }
}

/**
 * The sealing key from env (32 bytes, base64), or null when card saving is not
 * set up. A malformed key switches card saving off instead of stopping the app.
 */
export function qiTokenKeyFromEnv(): Buffer | null {
    const raw = env.QI_TOKEN_KEY;
    if (!raw) return null;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
        console.error("[qi] QI_TOKEN_KEY is not 32 bytes in base64; saving cards is off");
        return null;
    }
    return Buffer.from(raw, "base64");
}

function associatedData(tenantId: string): Buffer {
    return Buffer.from(`qi-card-token:${tenantId}`, "utf8");
}

export function sealQiToken(token: string, tenantId: string, key: Buffer): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(associatedData(tenantId));
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

export function openQiToken(sealed: string, tenantId: string, key: Buffer): string {
    const [version, body] = sealed.split(".");
    if (version !== VERSION || !body) throw new QiTokenSealError("not a sealed token");
    const raw = Buffer.from(body, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) throw new QiTokenSealError("sealed token too short");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(associatedData(tenantId));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    try {
        return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    } catch {
        // GCM's tag check failed: the key, the store, or the bytes are not the ones sealed.
        throw new QiTokenSealError("sealed token failed its check");
    }
}
