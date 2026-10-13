import { normalizePhoneForSearch } from "@/lib/order-utils";
import { extractScannedOrderId } from "@/lib/scan-utils";

/**
 * Order search, as the SERVER runs it.
 *
 * The orders page and the top-bar search used to filter whatever rows the
 * current date window had loaded (one day, by default), so an order from last
 * week could not be found by its phone or number. Search is now a lookup over
 * the caller's whole order book — independent of the date window and the status
 * chip — and this module is the single definition of what a typed term means:
 *
 *   - `parseOrderSearchTerm` folds the term into the shapes the columns hold;
 *   - `buildDirectSearchFilters` turns it into PostgREST filters for the
 *     direct-table path (used while `search_orders_v2` is not deployed);
 *   - `rankOrderSearchMatch` orders matches the same way the RPC does, so an
 *     exact order number or phone is never pushed out of the result limit by
 *     newer partial matches.
 *
 * Keep it in step with `search_orders_v2` (migration
 * 20261012120000_search_orders_v2.sql).
 */

/** Shorter terms are not searched: two characters already match broadly. */
export const MIN_SEARCH_TERM_LENGTH = 2;

/** Partial phone matching starts at this many national digits. */
export const MIN_PHONE_DIGITS = 4;

/** The most rows one search returns — the RPC clamps to the same value. */
export const MAX_SEARCH_RESULTS = 50;

/** A Postgres `integer` holds at most 10 digits; nine always fit. */
const SEQUENCE_PATTERN = /^-?\d{1,9}$/;
/** A term made only of what a phone number is written with. */
const PHONE_SHAPED = /^[+\d\s().-]+$/;
/** Anything that is not part of a number: the term may be a customer name. */
const HAS_NAME_CHARS = /[^\d\s+().#-]/;

export interface ParsedOrderSearch {
    /** The term with digits folded to ASCII, a scanned-label wrapper and a leading '#' removed. */
    text: string;
    /** National phone digits (no 0 / 964 / +964 prefix), when the term is phone-shaped. */
    phone: string | null;
    /** The term as an internal sequence number, when it is one. */
    sequence: number | null;
    /** The term as a customer-name fragment, when it contains letters. */
    name: string | null;
}

/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII.
 *
 * Staff type on Arabic and Persian keyboard layouts; a phone typed as
 * ۰۷۷۰… must find the order stored as 0770….
 */
export function foldDigits(value: string): string {
    return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
        const code = d.charCodeAt(0);
        return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
    });
}

/**
 * What a typed search term means, or null when it is too short to search.
 *
 * '#' is how the order card prints both the order number and the sequence
 * number (#7555, #3879); staff copy it with the number, and it is never part of
 * a stored value, so it is stripped.
 */
export function parseOrderSearchTerm(raw: string | null | undefined): ParsedOrderSearch | null {
    if (!raw) return null;
    const text = extractScannedOrderId(foldDigits(raw))
        .replace(/^#+\s*/, "")
        .trim();
    if (text.length < MIN_SEARCH_TERM_LENGTH) return null;

    const phoneDigits = PHONE_SHAPED.test(text) ? normalizePhoneForSearch(text) : "";
    return {
        text,
        phone: phoneDigits.length >= MIN_PHONE_DIGITS ? phoneDigits : null,
        sequence: SEQUENCE_PATTERN.test(text) ? Number(text) : null,
        name: HAS_NAME_CHARS.test(text) ? text : null,
    };
}

/** The stored shapes a national phone number takes in `orders.phone`. */
export function storedPhoneVariants(nationalDigits: string): string[] {
    return [`0${nationalDigits}`, `+964${nationalDigits}`, `964${nationalDigits}`, nationalDigits];
}

/**
 * A value inside a PostgREST `or=(…)` filter, double-quoted so that ',', '.',
 * ':' and parentheses in a term cannot break the filter apart.
 *
 * `*` is PostgREST's LIKE wildcard and `%` is Postgres's; neither is a
 * meaningful character in an order number, phone or name, so they are dropped
 * rather than escaped. A double quote or backslash would end or escape the
 * quoted value, so they are dropped too.
 */
export function postgrestQuoted(value: string): string {
    return `"${stripUnsafe(value)}"`;
}

function stripUnsafe(value: string): string {
    return value.replace(/[*%"\\]/g, "");
}

/** A quoted PostgREST `like` / `ilike` pattern; `*` is the only wildcard in it. */
function likePattern(prefix: string, value: string, suffix: string): string {
    return `"${prefix}${stripUnsafe(value)}${suffix}"`;
}

/** A contains-pattern for a PostgREST `like` / `ilike` filter. */
function containsPattern(value: string): string {
    return likePattern("*", value, "*");
}

export interface DirectSearchFilters {
    /**
     * Exact matches: the order number, sequence number, delivery / QR id, or the
     * full phone in any stored shape. Fetched separately so that a broad term
     * cannot push the one order it names out of the result limit.
     */
    exact: string;
    /** Partial matches: order-number, phone and name fragments. */
    partial: string;
}

/**
 * PostgREST `or=` filters for the direct-table search path.
 *
 * Phones are matched as digits with `like`: live phones are stored as `0…` or
 * `+964…` with no separators, and both contain the national digits, so the
 * normalized term is a substring of either shape.
 */
export function buildDirectSearchFilters(parsed: ParsedOrderSearch): DirectSearchFilters {
    const exact: string[] = [
        `order_id.eq.${postgrestQuoted(parsed.text)}`,
        // LightFunnels ids are stored as LF-<number>-<line>; the card shows #<number>.
        `order_id.like.${likePattern("LF-", parsed.text, "-*")}`,
        `order_id.like.${likePattern("CLN-LF-", parsed.text, "-*")}`,
        `delivery_order_id.eq.${postgrestQuoted(parsed.text)}`,
        `waseet_qr_id.eq.${postgrestQuoted(parsed.text)}`,
    ];
    if (parsed.sequence !== null) exact.push(`sequence_number.eq.${parsed.sequence}`);
    if (parsed.phone) {
        const variants = storedPhoneVariants(parsed.phone).map(postgrestQuoted).join(",");
        exact.push(`phone.in.(${variants})`, `secondary_phone.in.(${variants})`);
    }

    const partial: string[] = [`order_id.ilike.${containsPattern(parsed.text)}`];
    if (parsed.phone) {
        partial.push(`phone.like.${containsPattern(parsed.phone)}`, `secondary_phone.like.${containsPattern(parsed.phone)}`);
    }
    if (parsed.name) partial.push(`customer_name.ilike.${containsPattern(parsed.name)}`);

    return { exact: exact.join(","), partial: partial.join(",") };
}

/** The fields ranking reads. */
export interface RankableOrder {
    id: string;
    created_at: string;
    order_id?: string | null;
    sequence_number?: number | null;
    delivery_order_id?: string | null;
    waseet_qr_id?: string | null;
    phone?: string | null;
    secondary_phone?: string | null;
}

/**
 * 0 — the term IS this order's number (order id, LightFunnels base number,
 *     sequence number, delivery or QR id);
 * 1 — the term is this order's full phone or secondary phone;
 * 2 — a partial match.
 *
 * Mirrors the ORDER BY of `search_orders_v2`.
 */
export function rankOrderSearchMatch(order: RankableOrder, parsed: ParsedOrderSearch): 0 | 1 | 2 {
    const term = parsed.text.toLowerCase();
    const orderId = (order.order_id ?? "").toLowerCase();
    if (
        (parsed.sequence !== null && order.sequence_number === parsed.sequence) ||
        orderId === term ||
        orderId.startsWith(`lf-${term}-`) ||
        orderId.startsWith(`cln-lf-${term}-`) ||
        (order.delivery_order_id ?? "") === parsed.text ||
        (order.waseet_qr_id ?? "") === parsed.text
    ) {
        return 0;
    }
    if (
        parsed.phone &&
        (normalizePhoneForSearch(order.phone) === parsed.phone ||
            normalizePhoneForSearch(order.secondary_phone) === parsed.phone)
    ) {
        return 1;
    }
    return 2;
}

/**
 * Merge result sets (exact first), drop repeats, rank, newest first within a
 * rank, and cut to `limit`.
 */
export function rankSearchResults<T extends RankableOrder>(
    parsed: ParsedOrderSearch,
    sets: readonly (readonly T[])[],
    limit: number,
): T[] {
    const byId = new Map<string, T>();
    for (const set of sets) for (const row of set) if (!byId.has(row.id)) byId.set(row.id, row);

    const rows = [...byId.values()].map((row) => ({
        row,
        rank: rankOrderSearchMatch(row, parsed),
        at: Date.parse(row.created_at) || 0,
    }));
    rows.sort((a, b) => a.rank - b.rank || b.at - a.at || (a.row.id < b.row.id ? 1 : -1));
    return rows.slice(0, limit).map((r) => r.row);
}

/** Where an order lives, for labelling a search result. */
export type OrderSearchPlacement = "active" | "archived" | "trashed";

export function orderSearchPlacement(order: { is_archived?: boolean | null; deleted_at?: string | null }): OrderSearchPlacement {
    if (order.deleted_at) return "trashed";
    if (order.is_archived) return "archived";
    return "active";
}
