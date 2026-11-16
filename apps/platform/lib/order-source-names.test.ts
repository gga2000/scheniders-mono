import { describe, it, expect } from "vitest";
import { translations } from "./i18n";
import type { OrderSource } from "@/types/order";

/**
 * The reports source card and the orders table name a source with
 * t(`reports.source.name.<source>`). A source without a key showed its raw
 * database value ("storefront", "excel_import") on Arabic pages. The Record
 * type makes a new OrderSource fail type-check until it is listed here.
 */
const SOURCES: Record<OrderSource, true> = {
    whatsapp: true,
    lightfunnels: true,
    meta: true,
    tiktok: true,
    delivery_import: true,
    shop: true,
    telegram: true,
    storefront: true,
    prime: true,
    excel_import: true,
    manual: true,
    other: true,
};

describe("order source names", () => {
    for (const language of ["ar", "en"] as const) {
        it(`every order source has a ${language} name`, () => {
            const dict: Record<string, string> = translations[language];
            const missing = Object.keys(SOURCES).filter((s) => !dict[`reports.source.name.${s}`]);
            expect(missing).toEqual([]);
        });
    }
});
