import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * The Prime app password a store picks when it asks us for a new Prime account
 * is kept only sealed with AES-256-GCM: a fresh 12-byte IV per seal, the IV and
 * the 16-byte tag stored with the ciphertext, the key kept out of the database
 * (PRIME_LOGIN_KEY in the server env). The store's id is bound in as associated
 * data, so a sealed password copied onto another store's row does not open.
 *
 * Format: "v1." + base64url(iv | tag | ciphertext).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A sealed password that does not open: wrong key, wrong store, or changed. */
export class PrimeLoginSealError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PrimeLoginSealError";
    }
}

/** The sealing key from env (32 bytes, base64), or null when it is not set up (the new-account form stays closed). */
export function primeLoginKeyFromEnv(): Buffer | null {
    const raw = env.PRIME_LOGIN_KEY;
    if (!raw) return null;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
        console.error("[prime] PRIME_LOGIN_KEY is not 32 bytes in base64; new Prime accounts are off");
        return null;
    }
    return Buffer.from(raw, "base64");
}

function associatedData(tenantId: string): Buffer {
    return Buffer.from(`prime-login:${tenantId}`, "utf8");
}

export function sealPrimePassword(password: string, tenantId: string, key: Buffer): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(associatedData(tenantId));
    const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
    return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

export function openPrimePassword(sealed: string, tenantId: string, key: Buffer): string {
    const [version, body] = sealed.split(".");
    if (version !== VERSION || !body) throw new PrimeLoginSealError("not a sealed password");
    const raw = Buffer.from(body, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) throw new PrimeLoginSealError("sealed password too short");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(associatedData(tenantId));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    try {
        return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    } catch {
        // GCM's tag check failed: the key, the store, or the bytes are not the ones sealed.
        throw new PrimeLoginSealError("sealed password failed its check");
    }
}
