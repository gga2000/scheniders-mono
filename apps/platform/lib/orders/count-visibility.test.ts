import { describe, it, expect } from "vitest";
import { countVisibility, type CountContext } from "./count-visibility";

const base: CountContext = {
    facts: { ready: true, statusIsAll: true, windowIsAll: true },
    archived: false,
    columnFilter: false,
    riskLevel: undefined,
    duplicatesOnly: false,
    dueToday: false,
};
type Over = Omit<Partial<CountContext>, "facts"> & { facts?: Partial<CountContext["facts"]> };
const v = (over: Over = {}) =>
    countVisibility({ ...base, ...over, facts: { ...base.facts, ...over.facts } });

describe("countVisibility", () => {
    it("shows everything over the plain hook list", () => {
        expect(v()).toEqual({ chips: true, dueTodayBadge: true, riskBadge: true, flaggedCard: true });
    });

    it.each([
        ["not ready (search, uncovered window)", { facts: { ready: false } }],
        ["archived view", { archived: true }],
    ] as const)("hides every count when %s", (_label, over) => {
        expect(v(over)).toEqual({ chips: false, dueTodayBadge: false, riskBadge: false, flaggedCard: false });
    });

    it.each([
        ["a column filter", { columnFilter: true }],
        ["duplicates only", { duplicatesOnly: true }],
    ] as const)("hides every count under %s, which narrows the list after the hook", (_label, over) => {
        expect(v(over)).toEqual({ chips: false, dueTodayBadge: false, riskBadge: false, flaggedCard: false });
    });

    it("due-today on: only its own badge stays", () => {
        expect(v({ dueToday: true })).toEqual({ chips: false, dueTodayBadge: true, riskBadge: false, flaggedCard: false });
    });

    it("risk on: the risk badge and the Flagged card stay", () => {
        expect(v({ riskLevel: "flagged" })).toEqual({ chips: false, dueTodayBadge: false, riskBadge: true, flaggedCard: true });
        // ...even with a status tab and dates, since the list already has the risk filter.
        expect(v({ riskLevel: "high", facts: { statusIsAll: false, windowIsAll: false } }).riskBadge).toBe(true);
    });

    it("risk off: the risk badge only while status and dates are clear (turning it on clears them)", () => {
        expect(v({ facts: { statusIsAll: false } }).riskBadge).toBe(false);
        expect(v({ facts: { windowIsAll: false } }).riskBadge).toBe(false);
        expect(v({ facts: { statusIsAll: false, windowIsAll: false } })).toEqual({ chips: true, dueTodayBadge: true, riskBadge: false, flaggedCard: true });
    });
});
