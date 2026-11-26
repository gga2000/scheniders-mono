/**
 * The password rules Supabase Auth enforces for this project (Authentication >
 * Email: minimum length 8, "Letters and digits"), checked as the owner types
 * on sign-up and on the new-password page. Supabase also refuses passwords
 * found in known leaks; only the server can run that check, and the sign-up
 * route reports it as `weak_password` with the reason "pwned".
 */
export const PASSWORD_MIN_LENGTH = 8;
/** The longest password the sign-up route takes (bcrypt reads only 72 bytes). */
export const PASSWORD_MAX_LENGTH = 72;
/** From this length on, the strength meter gives a second point. */
export const PASSWORD_LONG_LENGTH = 12;

export interface PasswordRules {
    longEnough: boolean;
    /** Supabase's "letters" are a-z and A-Z only: Arabic letters do not count. */
    lettersAndDigits: boolean;
}

export function passwordRules(password: string): PasswordRules {
    return {
        longEnough: password.length >= PASSWORD_MIN_LENGTH,
        lettersAndDigits: /[a-zA-Z]/.test(password) && /\d/.test(password),
    };
}

export function passwordMeetsRules(password: string): boolean {
    const rules = passwordRules(password);
    return rules.longEnough && rules.lettersAndDigits;
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

/** What would still make a password stronger, beyond the rules it must meet. */
export type PasswordTip = "longer" | "mixedCase" | "symbol";

export function passwordTips(password: string): PasswordTip[] {
    const tips: PasswordTip[] = [];
    if (password.length < PASSWORD_LONG_LENGTH) tips.push("longer");
    if (!(/[a-z]/.test(password) && /[A-Z]/.test(password))) tips.push("mixedCase");
    if (!/[^a-zA-Z0-9]/.test(password)) tips.push("symbol");
    return tips;
}

/**
 * Why Supabase refused a password, from the reasons it gives with
 * `weak_password`: found in a known leak, or short of the rules above.
 */
export function weakPasswordReason(reasons: unknown): "leaked" | "rules" {
    return Array.isArray(reasons) && reasons.includes("pwned") ? "leaked" : "rules";
}
