import type { RiskLevel } from "@/types/order";

// =============================================
// COUNT VISIBILITY
//
// Every count on /orders is the length of the list its click opens, taken over
// the hook's list (useOrderFilters). That promise only holds while the list on
// screen IS the hook's list, unrefined, for the window the filter names. When
// it is not, the counts are hidden ("—"), never substituted from
// get_orders_aggregates, whose predicates differ:
//
//   search        the list is server hits across every status and date; a
//                 chip click does not narrow them.
//   archived      the desktop list shows archived orders; counts are over the
//                 active ones.
//   uncovered     the rows are for another window (first load, a window
//                 change in flight, cancelled or failed, sign-out).
//   refinement    a column filter, the duplicates toggle, the due-today toggle
//                 or the risk filter narrows the list after the hook; a chip
//                 click keeps the refinement, so the chip would overstate it.
//
// A badge is exempt from its own refinement: the due-today badge counts the
// list that toggle opens, as does the risk badge for the risk filter.
// =============================================

export interface CountContext {
    /** useOrderFilters' countViewFacts (deferred, from the list's render). */
    facts: { ready: boolean; statusIsAll: boolean; windowIsAll: boolean };
    /** Desktop archive view (deferred); always false on mobile. */
    archived: boolean;
    /** Any table column filter (deferred); always false on mobile. */
    columnFilter: boolean;
    /** The risk filter (deferred). */
    riskLevel: RiskLevel | undefined;
    /** The duplicates-only toggle (deferred); false on mobile, where it does not filter. */
    duplicatesOnly: boolean;
    /** The due-today toggle (deferred). */
    dueToday: boolean;
}

export interface CountVisibility {
    /** Status chips, pipeline, status cards, Needs Attention (urgent / no response / returns), product and channel chips. */
    chips: boolean;
    dueTodayBadge: boolean;
    riskBadge: boolean;
    /** Needs Attention: Flagged (it opens the risk filter). */
    flaggedCard: boolean;
}

export function countVisibility(c: CountContext): CountVisibility {
    const base = c.facts.ready && !c.archived;
    const refined = ({ exceptDue = false, exceptRisk = false } = {}) =>
        c.columnFilter || c.duplicatesOnly || (!exceptDue && c.dueToday) || (!exceptRisk && c.riskLevel !== undefined);
    return {
        chips: base && !refined(),
        dueTodayBadge: base && !refined({ exceptDue: true }),
        // Turning the risk filter on also clears status and dates, so with it
        // off the badge equals that list only when they are already clear.
        riskBadge: base && !refined({ exceptRisk: true }) &&
            (c.riskLevel !== undefined || (c.facts.statusIsAll && c.facts.windowIsAll)),
        flaggedCard: base && !refined({ exceptRisk: true }),
    };
}
