import { supabase } from "@/lib/supabase";

/** Thrown when there is no signed-in session to call our API with. */
export class SignedOutError extends Error {
    constructor() {
        super("signed_out");
        this.name = "SignedOutError";
    }
}

async function currentToken(): Promise<string> {
    // getSession refreshes a session whose access token has expired, so this
    // is a usable token even right after the laptop wakes from sleep.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new SignedOutError();
    return token;
}

/**
 * fetch() for our own /api routes, signed in as the current user.
 *
 * Hooks used to send `session.access_token` captured from React state. After
 * device sleep that token has expired, and the refetch on window focus fires
 * before the client refreshes it: Vercel logged 51 such 401s from 9 merchants
 * in one week, and screens showed nothing (an empty Prime desk, auto-send
 * shown OFF while ON). This reads the token at call time, and on a 401
 * refreshes once and retries once. Any Authorization header in `init` is
 * replaced.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const send = (token: string) => {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
    };
    const response = await send(await currentToken());
    if (response.status !== 401) return response;
    const { data, error } = await supabase.auth.refreshSession();
    const fresh = data.session?.access_token;
    if (error || !fresh) return response;
    return send(fresh);
}
