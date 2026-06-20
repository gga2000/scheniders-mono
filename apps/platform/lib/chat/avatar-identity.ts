// apps/platform/lib/chat/avatar-identity.ts
// Deterministic, dependency-free avatar identity for the chat surface.
// Same user id → same pastel everywhere; no Math.random (would break SSR + stability).

export interface AvatarColor {
    bg: string;
    fg: string;
}

/** The six pastel accent tokens, paired with ink text for AA contrast on light fills. */
export const AVATAR_PALETTE: AvatarColor[] = [
    { bg: "var(--pastel-yellow)", fg: "var(--ink)" },
    { bg: "var(--pastel-pink)", fg: "var(--ink)" },
    { bg: "var(--pastel-green)", fg: "var(--ink)" },
    { bg: "var(--pastel-mint)", fg: "var(--ink)" },
    { bg: "var(--pastel-purple)", fg: "var(--ink)" },
    { bg: "var(--pastel-blue)", fg: "var(--ink)" },
];

/** 1–2 letters from a display name. Spread-aware so multi-byte glyphs aren't split. */
export function initials(name: string): string {
    const tokens = name.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "?";
    if (tokens.length === 1) return [...tokens[0]].slice(0, 2).join("").toUpperCase();
    const first = [...tokens[0]][0] ?? "";
    const last = [...tokens[tokens.length - 1]][0] ?? "";
    return (first + last).toUpperCase();
}

/** Stable string hash → palette bucket. FNV-ish, unsigned. */
export function colorFromId(id: string): AvatarColor {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
