import { isValidIraqiMobile } from "@scheniders/shared";
import type { ShieldNetwork } from "./types";

/**
 * Shield's per-order delivery chance: an explainable points model.
 *
 * Starts from the typical first-order delivery rate and moves the odds for each
 * signal that measurably changes it on real orders (2026-11-04 study in
 * /mnt/project-files/fake-order-detection/RESEARCH.md): the customer's record
 * in other stores (Shield network), their record in this store, a short
 * address, how many products, the ad source, night orders, and how long the
 * order has waited for its first call. Every signal that moved the number is
 * returned as a reason, so the merchant sees why.
 */

export type ShieldBand = "red" | "yellow" | "green";

export interface ChanceReason {
    /** i18n key under `shield.reason.*`. */
    key: string;
    /** Which way the signal pushed: lower chance (risk) or higher (good). */
    effect: "risk" | "good";
}

/** One signal's move on the way from the typical order to this one, in whole percent. */
export interface ChanceStep {
    key: string;
    effect: "risk" | "good";
    from: number;
    to: number;
}

export interface DeliveryChance {
    /** 0-100: chance this order is delivered and paid. */
    chance: number;
    /** 0-100: where every order starts (the typical first-order delivery rate). */
    base: number;
    /** Each signal in the order it was applied, so the review can draw the path from base to chance. */
    steps: ChanceStep[];
    /** 0-100: what the ring shows (100 - chance). */
    risk: number;
    band: ShieldBand;
    reasons: ChanceReason[];
}

export interface OwnHistory {
    delivered: number;
    refused: number;
    noAnswer: number;
}

export interface ChanceInput {
    phone: string;
    status: string;
    createdAt: string;
    addressDetails?: string | null;
    itemLines: number;
    adChannel?: string | null;
    own?: OwnHistory | null;
    network?: ShieldNetwork | null;
    now?: Date;
}

/** Statuses where the warning still helps: the parcel has not left for good. */
export const SHIELD_OPEN_STATUSES = new Set(["new", "contacted", "confirmed", "suspended"]);

const BASE_RATE = 0.72;
const BASE_LOGIT = Math.log(BASE_RATE / (1 - BASE_RATE));

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function baghdadHour(iso: string): number {
    // Baghdad is UTC+3 all year (no daylight saving).
    return (new Date(iso).getUTCHours() + 3) % 24;
}

export function bandFor(risk: number): ShieldBand {
    if (risk >= 60) return "red";
    if (risk >= 35) return "yellow";
    return "green";
}

export function deliveryChance(input: ChanceInput): DeliveryChance {
    const reasons: ChanceReason[] = [];
    const steps: ChanceStep[] = [];
    const base = Math.round(BASE_RATE * 100);
    let logit = BASE_LOGIT;
    const push = (key: string, delta: number) => {
        const effect = delta < 0 ? "risk" : "good";
        reasons.push({ key, effect });
        steps.push({ key, effect, from: Math.round(sigmoid(logit) * 100), to: Math.round(sigmoid(logit + delta) * 100) });
        return delta;
    };

    if (!isValidIraqiMobile(input.phone)) {
        return {
            chance: 5, base, risk: 95, band: "red",
            reasons: [{ key: "invalidPhone", effect: "risk" }],
            steps: [{ key: "invalidPhone", effect: "risk", from: base, to: 5 }],
        };
    }

    const net = input.network;
    if (net && net.band !== "none") {
        if (net.band === "red") logit += push("networkRed", -1.4);
        else if (net.band === "yellow") logit += push("networkYellow", -0.6);
        else logit += push("networkGreen", 0.4);
    }

    const own = input.own;
    if (own) {
        const bad = own.refused + own.noAnswer;
        if (bad > 0 && bad >= own.delivered) logit += push("ownBad", -0.9);
        else if (bad > 0) logit += push("ownMixed", -0.3);
        else if (own.delivered > 0) logit += push("ownGood", 0.7);
    }

    const address = (input.addressDetails ?? "").trim();
    if (address.length < 15) logit += push("shortAddress", -0.55);
    else if (address.length >= 40) logit += push("fullAddress", 0.3);

    if (input.itemLines >= 2) logit += push("manyItems", 0.5);

    const channel = (input.adChannel ?? "").toLowerCase();
    if (channel === "facebook") logit += push("adFacebook", -0.45);
    else if (channel === "instagram") logit += push("adInstagram", -0.25);
    else if (channel === "tiktok") logit += push("adTiktok", -0.3);
    else if (channel === "") logit += push("direct", 0.3);

    const hour = baghdadHour(input.createdAt);
    if (hour >= 0 && hour < 6) logit += push("nightOrder", -0.2);

    if (input.status === "new") {
        const now = input.now ?? new Date();
        const waitedHours = (now.getTime() - new Date(input.createdAt).getTime()) / 3_600_000;
        if (waitedHours > 24) logit += push("waited24h", -1.2);
        else if (waitedHours > 6) logit += push("waited6h", -0.6);
        else if (waitedHours > 1) logit += push("waited1h", -0.3);
    }

    const chance = Math.round(sigmoid(logit) * 100);
    const risk = 100 - chance;
    // Strongest risks first, then the good signals.
    reasons.sort((a, b) => (a.effect === b.effect ? 0 : a.effect === "risk" ? -1 : 1));
    return { chance, base, steps, risk, band: bandFor(risk), reasons };
}
