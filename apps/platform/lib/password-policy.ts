/**
 * What a new password must be, on sign-up and on the new-password page.
 *
 * Only long enough (Supabase Auth's minimum, Authentication > Email) and not
 * a password found in known leaks; only the server can run that check, and it
 * reports it as `weak_password` with the reason "pwned". No mix of letters,
 * digits or symbols is required (Ali, 28 Nov 2026): a merchant may keep a
 * simple password that is easy to remember. One that is weak is called weak,
 * accepted, and its owner is asked a week later to pick a stronger one
 * (`password_reminders`, lib/password-reminder.ts).
 */
export const PASSWORD_MIN_LENGTH = 8;
/** The longest password the sign-up route takes (bcrypt reads only 72 bytes). */
export const PASSWORD_MAX_LENGTH = 72;
/** From this length on, the strength meter gives a second point. */
export const PASSWORD_LONG_LENGTH = 12;
/** The meter's «مقبولة»: from this score on, a password is not called weak. */
export const PASSWORD_FAIR_STRENGTH = 3;

/** Long enough for Supabase: the one rule a new password is held to on the page. */
export function passwordLongEnough(password: string): boolean {
    return password.length >= PASSWORD_MIN_LENGTH;
}

/**
 * 0 (empty) to 5 (strong): one point each for 8+ characters, 12+ characters,
 * both upper and lower case, a digit, and a symbol.
 */
export function passwordStrength(password: string): number {
    let score = 0;
    if (password.length >= PASSWORD_MIN_LENGTH) score++;
    if (password.length >= PASSWORD_LONG_LENGTH) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    return score;
}

/** Accepted, but easy to guess: the meter's «كلش ضعيفة» and «ضعيفة». */
export function passwordIsWeak(password: string): boolean {
    return passwordStrength(password) < PASSWORD_FAIR_STRENGTH;
}

/** What would make a password stronger, in the order the tips are read. */
export type PasswordTip = "longer" | "mixedCase" | "digit" | "symbol";

export function passwordTips(password: string): PasswordTip[] {
    const tips: PasswordTip[] = [];
    if (password.length < PASSWORD_LONG_LENGTH) tips.push("longer");
    if (!(/[a-z]/.test(password) && /[A-Z]/.test(password))) tips.push("mixedCase");
    if (!/\d/.test(password)) tips.push("digit");
    if (!/[^a-zA-Z0-9]/.test(password)) tips.push("symbol");
    return tips;
}

/**
 * Why Supabase refused a password, from the reasons it gives with
 * `weak_password`: found in a known leak, short of the minimum length, or
 * short of a character rule (only while the project still asks for one).
 */
export function weakPasswordReason(reasons: unknown): "leaked" | "characters" | "length" {
    if (!Array.isArray(reasons)) return "length";
    if (reasons.includes("pwned")) return "leaked";
    if (reasons.includes("characters")) return "characters";
    return "length";
}

/** The message key for each reason Supabase gives; `{n}` is PASSWORD_MIN_LENGTH. */
export const WEAK_PASSWORD_MESSAGE_KEYS: Record<ReturnType<typeof weakPasswordReason>, string> = {
    leaked: "signup.err.passwordLeaked",
    characters: "signup.err.passwordRules",
    length: "signup.err.passwordShort",
};
