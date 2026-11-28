import { newSecretTicket, secretTicketMatches } from "@/lib/secret-ticket";

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

export function newSignupWaitTicket(): { ticket: string; hash: string } {
    return newSecretTicket();
}

/** Whether `ticket` is the one whose hash the account keeps, compared in constant time. */
export function signupWaitTicketMatches(ticket: string, storedHash: unknown): boolean {
    return secretTicketMatches(ticket, storedHash);
}

/** Whether an account made at `createdAt` is still within the time its page may ask. */
export function signupWaitOpen(createdAt: string, now: number = Date.now()): boolean {
    const made = Date.parse(createdAt);
    return Number.isFinite(made) && now - made <= SIGNUP_WAIT_HOURS * 60 * 60 * 1000;
}
