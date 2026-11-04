// Why customers send Prime parcels back: the share against the 30 days
// before, the team's reasons, and the governorates where most come back.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { PrimeReturnsSummary } from "@/lib/prime/returns";
import { translations } from "@/lib/i18n";

const t = (key: string, vars?: Record<string, string | number>) => {
    const template = translations.en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
};

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t, language: "en" }), useTextDir: () => "ltr" }));

const returns = vi.hoisted(() => ({ summary: null as unknown, isPending: false, isError: false }));
vi.mock("@/hooks/use-prime-returns", () => ({ usePrimeReturns: () => returns }));

import { PrimeReturnsTab } from "./prime-returns-tab";

const SUMMARY: PrimeReturnsSummary = {
    finished: 884,
    returned: 88,
    rate: 10,
    previousRate: 13.2,
    savedByResend: 12,
    reasons: [
        { reason: "Customer refused", parcels: 40 },
        { reason: "No answer", parcels: 21 },
        { reason: null, parcels: 6 },
    ],
    areas: [
        { governorate: "ANB", parcels: 58, returned: 14, rate: 24.1 },
        { governorate: "BGD", parcels: 514, returned: 39, rate: 7.6 },
        { governorate: null, parcels: 3, returned: 0, rate: 0 },
    ],
};

describe("PrimeReturnsTab", () => {
    afterEach(() => {
        cleanup();
        returns.summary = null;
    });

    it("shows the share coming back next to the 30 days before", () => {
        returns.summary = SUMMARY;
        render(<PrimeReturnsTab />);

        expect(screen.getByText("10%")).toBeTruthy();
        expect(screen.getByText("Was 13.2% the 30 days before")).toBeTruthy();
        expect(screen.getByText("88")).toBeTruthy();
        expect(screen.getByText("of 884 Prime finished")).toBeTruthy();
        expect(screen.getByText("12")).toBeTruthy();
    });

    it("lists the team's reasons with the parcels that have none yet named as such", () => {
        returns.summary = SUMMARY;
        render(<PrimeReturnsTab />);

        const reasons = within(screen.getByRole("region", { name: "Reasons" })).getAllByRole("listitem");
        expect(reasons.map((li) => li.textContent)).toEqual(["Customer refused40", "No answer21", "No reason recorded yet6"]);
    });

    it("names each governorate, and the parcels with none", () => {
        returns.summary = SUMMARY;
        render(<PrimeReturnsTab />);

        const rows = within(screen.getByRole("region", { name: "By governorate" })).getAllByRole("row").slice(1);
        expect(rows.map((tr) => within(tr).getAllByRole("cell").map((td) => td.textContent))).toEqual([
            ["Anbar", "58", "14", "24.1%"],
            ["Baghdad", "514", "39", "7.6%"],
            ["No governorate", "3", "0", "0%"],
        ]);
    });

    it("says so when Prime finished nothing in the window", () => {
        returns.summary = { ...SUMMARY, finished: 0, returned: 0, rate: null, previousRate: null, savedByResend: 0, reasons: [], areas: [] };
        render(<PrimeReturnsTab />);

        expect(screen.getByText("Prime has not finished any parcels in the last 30 days.")).toBeTruthy();
    });
});
