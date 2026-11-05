import { IRAQ_GOVERNORATES, isValidIraqiMobile } from "@scheniders/shared";
import type { ShieldNetwork, TrustStep } from "./types";

/**
 * Shield Trust score (Ali, 2026-11-05): every customer starts at 100 and moves
 * only on what they did, in this store and in other stores. The points are
 * computed in the database (shield.trust, migration 20261105025152); this file
 * only turns the result into a band and reads the order's own facts, which are
 * warnings and never points: a wrong phone number, no address, or an address
 * that is only the governorate.
 */

export type ShieldBand = "red" | "yellow" | "green";

/** Statuses where the warning still helps: the parcel has not left for good. */
export const SHIELD_OPEN_STATUSES = new Set(["new", "contacted", "confirmed", "suspended"]);

export interface Trust {
    /** 0-100; 100 for a number with no record. */
    score: number;
    /** No finished order here or (counted) in other stores. */
    isNew: boolean;
    band: ShieldBand;
    /** Each counted order, oldest first, with the points it moved. */
    steps: TrustStep[];
}

export function trustBand(score: number): ShieldBand {
    if (score >= 80) return "green";
    if (score >= 50) return "yellow";
    return "red";
}

/** The Trust score from a shield_lookup row; no row (first order here) reads as a new customer. */
export function trustOf(row: ShieldNetwork | null): Trust {
    if (!row) return { score: 100, isNew: true, band: "green", steps: [] };
    return { score: row.trust, isNew: row.trust_new, band: trustBand(row.trust), steps: row.trust_steps };
}

/** The step that cost the most points; this store's own record wins a tie. */
export function worstStep(steps: TrustStep[]): TrustStep | null {
    let worst: TrustStep | null = null;
    for (const s of steps) {
        if (s.pts >= 0) continue;
        if (!worst || s.pts < worst.pts || (s.pts === worst.pts && s.src === "own" && worst.src !== "own")) worst = s;
    }
    return worst;
}

export type OrderCheck = "invalidPhone" | "noAddress" | "governorateOnly";

/** Letters only, with the common Arabic spelling variants folded, and the word «محافظة» dropped. */
function bare(s: string): string {
    return s
        .replace(/محافظة/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[^\p{L}\p{N}]/gu, "")
        .toLowerCase();
}

const GOVERNORATE_WORDS = new Set(
    IRAQ_GOVERNORATES.flatMap((g) => [g.name, g.name_en, g.name_ku, g.name.replace(/^ال/, "")]).map(bare),
);

export interface OrderFacts {
    phone: string;
    addressDetails?: string | null;
    city?: string | null;
}

/**
 * Facts about this order worth a call before shipping. On this store's orders,
 * an empty address delivered 6% and an address that is only the city or
 * governorate 31%, against 63% overall (2026-11-05); a short but real address
 * did not stand out, so it is not checked.
 */
export function orderChecks(order: OrderFacts): OrderCheck[] {
    const checks: OrderCheck[] = [];
    if (!isValidIraqiMobile(order.phone)) checks.push("invalidPhone");
    const address = bare(order.addressDetails ?? "");
    if (!address) checks.push("noAddress");
    else if (GOVERNORATE_WORDS.has(address) || (order.city && address === bare(order.city))) checks.push("governorateOnly");
    return checks;
}
