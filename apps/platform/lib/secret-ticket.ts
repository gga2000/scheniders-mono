import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A random secret handed to one browser, of which the server keeps only the
 * sha256 hash. Whoever later shows the secret is that browser. Used by the
 * sign-up page waiting on an email confirm (lib/signup-wait.ts) and by a
 * computer waiting on a phone's scan (lib/computer-sign-in.ts).
 */

function hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
}

export function newSecretTicket(): { ticket: string; hash: string } {
    const ticket = randomBytes(32).toString("base64url");
    return { ticket, hash: hashSecret(ticket) };
}

/** Whether `ticket` is the one whose hash was kept, compared in constant time. */
export function secretTicketMatches(ticket: string, storedHash: unknown): boolean {
    if (typeof storedHash !== "string" || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
    return timingSafeEqual(Buffer.from(hashSecret(ticket), "hex"), Buffer.from(storedHash, "hex"));
}
