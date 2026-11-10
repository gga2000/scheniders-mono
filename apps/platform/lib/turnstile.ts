import { z } from "zod";
import { env } from "@/lib/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifySchema = z.object({
    success: z.boolean(),
    "error-codes": z.array(z.string()).optional(),
});

export type TurnstileResult =
    | { ok: true; skipped: boolean }
    | { ok: false; reason: "missing" | "rejected" | "unavailable"; codes?: string[] };

/**
 * Checks a Cloudflare Turnstile token on the server. Routes that do their own
 * account work with the service role (sign-up) need this, because Supabase's
 * CAPTCHA protection only covers requests that reach Supabase Auth directly.
 *
 * Skipped when TURNSTILE_SECRET_KEY is unset outside Production (local dev
 * and previews). In Production a missing secret refuses every sign-up rather
 * than silently letting bots through. A token passes once; reusing it is
 * "rejected".
 */
export async function verifyTurnstile(token: string | undefined, remoteIp: string | null): Promise<TurnstileResult> {
    const secret = env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        return env.VERCEL_ENV === "production" ? { ok: false, reason: "unavailable" } : { ok: true, skipped: true };
    }
    if (!token) return { ok: false, reason: "missing" };

    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set("remoteip", remoteIp);

    let res: Response;
    try {
        res = await fetch(SITEVERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    if (!res.ok) return { ok: false, reason: "unavailable" };

    const parsed = siteverifySchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, reason: "unavailable" };
    if (!parsed.data.success) return { ok: false, reason: "rejected", codes: parsed.data["error-codes"] };
    return { ok: true, skipped: false };
}
