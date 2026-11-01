export interface TokenHealthView {
    isValid: boolean;
    expiresAt: string | null;
    hasAdsRead: boolean;
}

export type TokenWarning = "invalid" | "missingAdsRead" | "expiring";

export const TOKEN_EXPIRY_WARN_DAYS = 7;

/** What the page should tell the owner about the stored token; null when healthy or unknown. */
export function tokenWarning(health: TokenHealthView | null | undefined, now: Date): TokenWarning | null {
    if (!health) return null;
    if (!health.isValid) return "invalid";
    if (!health.hasAdsRead) return "missingAdsRead";
    if (health.expiresAt) {
        const msLeft = new Date(health.expiresAt).getTime() - now.getTime();
        if (msLeft <= TOKEN_EXPIRY_WARN_DAYS * 86_400_000) return "expiring";
    }
    return null;
}
