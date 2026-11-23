/** What Supabase Auth hands back when a sign-in fails. */
export interface LoginFailure {
    message: string;
    code?: string;
    status?: number;
}

export type LoginErrorKey =
    | "login.error.invalid"
    | "login.error.unconfirmed"
    | "login.error.rateLimit"
    | "login.error.captcha"
    | "login.error.network"
    | "login.error.unexpected";

/**
 * The message to show for a failed sign-in, as an i18n key. Supabase's own
 * text is English and written for developers, so it is never shown.
 */
export function loginErrorKey(failure: LoginFailure): LoginErrorKey {
    if (failure.code === "invalid_credentials" || failure.message.includes("Invalid login credentials")) return "login.error.invalid";
    if (failure.code === "email_not_confirmed") return "login.error.unconfirmed";
    if (failure.code === "over_request_rate_limit" || failure.status === 429) return "login.error.rateLimit";
    if (failure.code === "captcha_failed") return "login.error.captcha";
    // supabase-js reports a request that never reached the server with status 0.
    if (failure.status === 0 || failure.message.includes("Failed to fetch")) return "login.error.network";
    return "login.error.unexpected";
}

/** Null when the email looks sendable, else the i18n key of what is wrong with it. */
export function emailProblem(email: string): "login.error.emailRequired" | "login.error.emailInvalid" | null {
    const value = email.trim();
    if (value.length === 0) return "login.error.emailRequired";
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "login.error.emailInvalid";
}
