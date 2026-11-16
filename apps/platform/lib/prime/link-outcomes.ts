/**
 * Why a store's Prime link request is still open (Fermi A3), as the database
 * keeps it on prime_link_requests.outcome:
 * - not_linked: Prime has not linked the account to our system yet;
 * - shared_account: another store uses the account or asked for it, so our team decides;
 * - choose_shop: the account has several shops and the store picks one;
 * - no_shop: the account has no active shop at Prime;
 * - prime_down: Prime did not answer.
 * Shared by the server and the Prime page.
 */
export const PRIME_LINK_OUTCOMES = ["not_linked", "shared_account", "choose_shop", "no_shop", "prime_down"] as const;
export type PrimeLinkOutcome = (typeof PRIME_LINK_OUTCOMES)[number];
