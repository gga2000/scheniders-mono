import { describe, it, expect } from "vitest";
import { translations } from "@/lib/i18n";
import type { DeliveryImport, MatchCategory, MatchedRow } from "@/types/delivery-import";
import type { ImportStep } from "@/hooks/use-delivery-import";
import type { FilterMode } from "./import-review-table";

/**
 * The courier import screens build some keys from data:
 * t(`deliveryImport.category.${match.category}`) and the like. A value with
 * no key shows the raw key on screen. Each Record type makes a new value fail
 * type-check until it is listed here, and the test then needs both languages.
 */
const CATEGORIES: Record<MatchCategory, true> = {
    clean: true,
    pending_confirmation: true,
    price_changed: true,
    partial_delivery: true,
    amount_mismatch: true,
    phone_mismatch: true,
    negative_refund: true,
    not_found: true,
    already_delivered: true,
    wrong_status: true,
    reorder: true,
};
const STATUSES: Record<DeliveryImport["status"], true> = {
    pending: true,
    confirmed: true,
    completed: true,
    cancelled: true,
};
const STEPS: Record<ImportStep, true> = {
    upload: true,
    processing: true,
    review: true,
    confirming: true,
    done: true,
};
const FILTERS: Record<FilterMode, true> = {
    all: true,
    clean: true,
    review: true,
    critical: true,
    handled: true,
};
const MATCHED_BY: Record<MatchedRow["matchedBy"], true> = {
    order_id: true,
    phone: true,
    none: true,
};

const KEYS = [
    ...Object.keys(CATEGORIES).map((v) => `deliveryImport.category.${v}`),
    ...Object.keys(STATUSES).map((v) => `deliveryImport.status.${v}`),
    ...Object.keys(STEPS).map((v) => `deliveryImport.step.${v}`),
    ...Object.keys(FILTERS).map((v) => `deliveryImport.filter.${v}`),
    ...Object.keys(MATCHED_BY).map((v) => `deliveryImport.matchedBy.${v}`),
    ...[1, 2, 3, 4].map((n) => `deliveryImport.how.${n}`),
];

describe("courier import keys built from data", () => {
    for (const language of ["ar", "en"] as const) {
        it(`every value has a ${language} label`, () => {
            const dict: Record<string, string> = translations[language];
            expect(KEYS.filter((k) => !dict[k])).toEqual([]);
        });
    }
});
