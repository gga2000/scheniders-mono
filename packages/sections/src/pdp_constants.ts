// Defaults shared by the pdp_direct_order section definition and its client
// components. They live here, not in pdp_direct_order.tsx, because that file
// holds the section's zod schema: a client component importing a constant from
// it would ship the whole zod library to every shopper.

export const DEFAULT_URGENCY_MAX_STOCK = 10;

/** Express hero: how long each extra photo leads the thumbnail deck. */
export const DEFAULT_DECK_ROTATE_MS = 4000;
