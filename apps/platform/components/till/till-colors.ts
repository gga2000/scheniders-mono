/** The till's pastel tiles (from the approved concepts), with ink text on top in both themes. */
export const TILE = {
    pink: "#F4C7CF",
    green: "#C0EBA6",
    blue: "#A6C8FF",
    purple: "#E4C1F9",
    yellow: "#FBE38E",
    mint: "#B8E8E0",
    peach: "#FFD6BA",
} as const;

/** One tile colour per note, biggest first, matching IQD_NOTES. */
export const NOTE_TILES: Record<number, string> = {
    50_000: TILE.pink,
    25_000: TILE.green,
    10_000: TILE.blue,
    5_000: TILE.purple,
    1_000: TILE.yellow,
    500: TILE.mint,
    250: TILE.peach,
};

export const INK_BUTTON = "bg-[var(--ink)] text-white dark:bg-[#EFFF00] dark:text-[#121212]";
