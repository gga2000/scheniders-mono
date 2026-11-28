/**
 * Limits for «احجي الطلب» (voice order on New Order). Kept apart from the
 * Gemini code so the browser can read them without pulling that in.
 */

/** A minute of talk; the recorder stops itself there. */
export const VOICE_ORDER_MAX_SECONDS = 60;

/**
 * Largest recording accepted. The recorder makes ~32 kbit/s Opus or AAC, so a
 * full minute is ~240 KB; 2 MB leaves room for browsers that ignore the bit
 * rate and still bounds what one request can bill to the Gemini key.
 */
export const VOICE_ORDER_MAX_BYTES = 2_097_152;

/** Each store's daily allowance. Every listen is a paid Gemini call. */
export const VOICE_ORDER_DAILY_LIMIT = 100;
