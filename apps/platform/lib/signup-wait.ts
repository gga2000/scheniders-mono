import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The sign-up page left open on a computer while its owner opens the confirm
 * link on their phone. Sign-up hands the page a random ticket and keeps only
 * its hash on the new account (app_metadata.signup_wait); with it the page may
 * ask one thing about that one account: is its email confirmed yet? Once it is,
 * the page signs in with the email and password it was just given, through
 * Supabase like any sign-in.
 */

/** How long after sign-up the page may still ask. */
export const SIGNUP_WAIT_HOURS = 24;

function hashTicket(ticket: string): string {
    return createHash("sha256").update(ticket).digest("hex");
}

export function newSignupWaitTicket(): { ticket: string; hash: string } {
    const ticket = randomBytes(32).toString("base64url");
    return { ticket, hash: hashTicket(ticket) };
}

/** Whether `ticket` is the one whose hash the account keeps, compared in constant time. */
export function signupWaitTicketMatches(ticket: string, storedHash: unknown): boolean {
    if (typeof storedHash !== "string" || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
    return timingSafeEqual(Buffer.from(hashTicket(ticket), "hex"), Buffer.from(storedHash, "hex"));
}

/** Whether an account made at `createdAt` is still within the time its page may ask. */
export function signupWaitOpen(createdAt: string, now: number = Date.now()): boolean {
    const made = Date.parse(createdAt);
    return Number.isFinite(made) && now - made <= SIGNUP_WAIT_HOURS * 60 * 60 * 1000;
}
