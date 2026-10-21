// Mint a real Supabase session for the perf harness, as the cookies the app's
// @supabase/ssr client reads — no UI login, no password.
//
// The service-role key generates a magic-link token for PERF_EMAIL (nothing is
// emailed), the anon client exchanges it for a session, and a server client
// with a capturing cookie adapter serialises that session exactly as the app
// would (`sb-<ref>-auth-token`, base64, chunked). Runs in Node only; the
// service-role key never reaches the browser.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export interface PerfCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax";
    expires: number;
}

/** KEY=value lines of a dotenv file, without overriding the real environment. */
export function loadEnvFile(file: string): void {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m || process.env[m[1]] !== undefined) continue;
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
}

function required(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set (apps/platform/.env.local or the environment)`);
    return v;
}

export async function mintSessionCookies(email: string, baseUrl: string): Promise<{ cookies: PerfCookie[]; userId: string }> {
    loadEnvFile(path.resolve(__dirname, "../../.env.local"));
    const url = required("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link.properties?.hashed_token) throw new Error(`generateLink failed for ${email}: ${linkErr?.message ?? "no token"}`);

    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: verified, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (otpErr || !verified.session) throw new Error(`verifyOtp failed for ${email}: ${otpErr?.message ?? "no session"}`);

    const captured: Array<{ name: string; value: string }> = [];
    const ssr = createServerClient(url, anonKey, {
        cookies: {
            getAll: () => [],
            setAll: (list) => {
                for (const c of list) captured.push({ name: c.name, value: c.value });
            },
        },
    });
    const { error: setErr } = await ssr.auth.setSession({
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
    });
    if (setErr) throw new Error(`setSession failed: ${setErr.message}`);
    if (captured.length === 0) throw new Error("the SSR client wrote no session cookie");

    const { hostname, protocol } = new URL(baseUrl);
    const expires = Math.floor(Date.now() / 1000) + 3600;
    return {
        userId: verified.session.user.id,
        cookies: captured
            .filter((c) => c.value !== "")
            .map((c) => ({
                name: c.name,
                value: c.value,
                domain: hostname,
                path: "/",
                httpOnly: false,
                secure: protocol === "https:",
                sameSite: "Lax" as const,
                expires,
            })),
    };
}
