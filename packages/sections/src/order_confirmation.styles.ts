// =====================================================================
// order_confirmation — surface tokens shared with its call card
// =====================================================================
// One definition for the thank-you section and the opt-in call card that
// replaces its head card, so the two can never drift apart. Everything is
// a --bk-* token with the Candy fallback the section has always used.
// =====================================================================

export const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";

export const CARD_STYLE = {
  backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
  borderRadius: "var(--bk-radius-card, 1rem)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

export const LABEL_CLS =
  "font-label font-bold text-[11px] bk-caps tracking-[0.2em] text-bk-ink-soft";
