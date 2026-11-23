// While Prime refuses our reads, the page must not pass off unread money as 0.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { translations } from "@/lib/i18n";
import { PrimeReadError } from "@/lib/prime/read-error";

const t = (key: string, vars?: Record<string, string | number>) => {
    const template = translations.en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
};
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t, language: "en" }), useTextDir: () => "ltr" }));

const statements = vi.hoisted(() => ({ data: undefined as unknown, isPending: false, isError: false, error: null as unknown }));
vi.mock("@/hooks/use-prime-statements", () => ({
    usePrimeStatements: () => statements,
    usePrimeStatement: () => ({ data: undefined, isPending: false }),
    usePrimeStatementAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./use-action-problem", () => ({ useActionProblem: () => () => null }));

import { PrimeMoneyStrip } from "./prime-money-strip";
import { PrimeStatementCard } from "./prime-statement-card";

const failWith = (reason: string) => {
    statements.isError = true;
    statements.error = new PrimeReadError(reason, 502, "Prime statements");
};

afterEach(() => {
    cleanup();
    Object.assign(statements, { data: undefined, isPending: false, isError: false, error: null });
});

describe("PrimeMoneyStrip", () => {
    it("shows a dash and says why when Prime's payments could not be read", () => {
        failWith("prime_rejected");
        const { container } = render(<PrimeMoneyStrip onRoad={967000} admin />);
        const waiting = container.querySelector("[data-prime-money='waiting']");
        const diff = container.querySelector("[data-prime-money='diff']");
        expect(waiting?.textContent).toBe(`${t("prime.page.moneyWaiting")}—${t("prime.page.moneyUnread")}`);
        expect(diff?.textContent).toBe(`${t("prime.page.moneyDiff")}—`);
        // The parcels' cash is our own record, still shown.
        expect(container.querySelector("[data-prime-money='on_road']")?.textContent).toContain("967,000");
    });

    it("keeps the amounts read before when a later read fails", () => {
        statements.data = {
            success: true,
            connected: true,
            statements: [{ id: 7, amount: 250000, at: null, confirmed: true, remarks: null, check: null, approval: null }],
            latest: null,
        };
        failWith("prime_unreachable");
        const { container } = render(<PrimeMoneyStrip onRoad={0} admin />);
        expect(container.querySelector("[data-prime-money='waiting']")?.textContent).toContain("250,000");
        expect(screen.queryByText(t("prime.page.moneyUnread"))).toBeNull();
    });

    it("shows 0 only when Prime answered with nothing waiting", () => {
        statements.data = { success: true, connected: true, statements: [], latest: null };
        const { container } = render(<PrimeMoneyStrip onRoad={0} admin />);
        expect(container.querySelector("[data-prime-money='waiting'] b")?.textContent).toBe(`0${t("common.iqd")}`);
    });
});

describe("PrimeStatementCard", () => {
    it("does not promise a minute when Prime refused us", () => {
        failWith("prime_rejected");
        render(<PrimeStatementCard onOpen={() => {}} />);
        expect(screen.getByText(t("prime.page.statementsUnread"))).toBeTruthy();
        expect(screen.queryByText(t("orders.prime.unreachable"))).toBeNull();
    });

    it("asks to try in a minute when Prime is only silent", () => {
        failWith("prime_unreachable");
        render(<PrimeStatementCard onOpen={() => {}} />);
        expect(screen.getByText(t("orders.prime.unreachable"))).toBeTruthy();
    });
});
