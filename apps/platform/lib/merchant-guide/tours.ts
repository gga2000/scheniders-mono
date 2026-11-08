// =====================================================================
// Phases 3 to 9 of the merchant guide, and the staff tour
// =====================================================================
// After the basics, the guide keeps a small list in the corner («دليلك»)
// with the optional phases. Each one is a short walk over real pages: the
// light sits on one piece, one line is said, and Next moves on. A phase is
// also offered once, on the first visit to its page; «بعدين» closes that
// offer for good and the phase stays in the list.
//
// Phase 2 (First order) lives in first-order.ts: it makes practice orders
// and ticks from them, so it is not a plain walk.
// =====================================================================

import type { GuideLineId } from "./script";

/** What a shop has, which decides the phases and stops it is shown. */
export interface GuideShopFacts {
    /** Welcome answer: «عندي موظفين». */
    staff: boolean;
    /** Welcome answer: «أونلاين ومحل». */
    inShop: boolean;
    primeLinked: boolean;
    adsLinked: boolean;
}

export interface TourStop {
    id: string;
    /** The page the stop happens on (pathname prefix). */
    path: string;
    /** Where "Take me there" goes. */
    href: string;
    selector: string;
    line: GuideLineId;
    labelKey: string;
    when?: (facts: GuideShopFacts) => boolean;
}

export const TOUR_PHASE_IDS = ["courier", "products", "money", "customers", "team", "till", "look"] as const;
export type TourPhaseId = (typeof TOUR_PHASE_IDS)[number];

export interface TourPhase {
    id: TourPhaseId;
    labelKey: string;
    minutes: number;
    /** Offered on the first visit to this page (pathname prefix). */
    offerOn: string;
    when?: (facts: GuideShopFacts) => boolean;
    stops: readonly TourStop[];
}

const linked = (f: GuideShopFacts) => f.primeLinked;
const notLinked = (f: GuideShopFacts) => !f.primeLinked;

export const TOUR_PHASES: readonly TourPhase[] = [
    {
        id: "courier",
        labelKey: "guide.tour.courier",
        minutes: 3,
        offerOn: "/prime",
        stops: [
            {
                id: "request",
                path: "/prime",
                href: "/prime",
                selector: '[data-guide="prime-request"]',
                line: "courier.request",
                labelKey: "guide.tour.stop.primeRequest",
                when: notLinked,
            },
            {
                id: "queues",
                path: "/orders",
                href: "/orders",
                selector: '[data-chip="prime_fix"]',
                line: "courier.queues",
                labelKey: "guide.tour.stop.primeQueues",
                when: linked,
            },
            {
                id: "strip",
                path: "/orders",
                href: "/orders",
                selector: "[data-prime-band]",
                line: "courier.strip",
                labelKey: "guide.tour.stop.primeStrip",
                when: linked,
            },
        ],
    },
    {
        id: "products",
        labelKey: "guide.tour.products",
        minutes: 3,
        offerOn: "/products",
        stops: [
            { id: "low", path: "/products", href: "/products", selector: '[data-guide="low-stock"]', line: "products.low", labelKey: "guide.tour.stop.lowStock" },
            { id: "count", path: "/products", href: "/products", selector: '[data-guide="stock-count"]', line: "products.count", labelKey: "guide.tour.stop.stockCount" },
        ],
    },
    {
        id: "money",
        labelKey: "guide.tour.money",
        minutes: 3,
        offerOn: "/finances",
        stops: [
            { id: "numbers", path: "/finances", href: "/finances", selector: '[data-guide="money-numbers"]', line: "money.numbers", labelKey: "guide.tour.stop.moneyNumbers" },
            { id: "cash", path: "/finances", href: "/finances", selector: '[data-guide="money-cash"]', line: "money.cash", labelKey: "guide.tour.stop.moneyCash" },
            { id: "expense", path: "/finances", href: "/finances?tab=expenses", selector: '[data-guide="add-expense"]', line: "money.expense", labelKey: "guide.tour.stop.addExpense" },
        ],
    },
    {
        id: "customers",
        labelKey: "guide.tour.customers",
        minutes: 4,
        offerOn: "/customers",
        stops: [
            { id: "groups", path: "/customers", href: "/customers", selector: '[data-guide="customer-groups"]', line: "customers.groups", labelKey: "guide.tour.stop.customerGroups" },
            {
                id: "ads",
                path: "/ads",
                href: "/ads",
                selector: '[data-guide="ads-numbers"]',
                line: "customers.ads",
                labelKey: "guide.tour.stop.ads",
                when: (f) => f.adsLinked,
            },
            { id: "reports", path: "/reports", href: "/reports", selector: '[data-guide="attention-flags"]', line: "customers.reports", labelKey: "guide.tour.stop.reports" },
        ],
    },
    {
        id: "team",
        labelKey: "guide.tour.team",
        minutes: 2,
        offerOn: "/settings",
        when: (f) => f.staff,
        stops: [
            { id: "invite", path: "/settings", href: "/settings?section=team", selector: '[data-guide="team-invite"]', line: "team.invite", labelKey: "guide.tour.stop.teamInvite" },
        ],
    },
    {
        id: "till",
        labelKey: "guide.tour.till",
        minutes: 2,
        offerOn: "/till",
        when: (f) => f.inShop,
        stops: [
            { id: "signin", path: "/till", href: "/till", selector: '[data-guide="till-signin"]', line: "till.signin", labelKey: "guide.tour.stop.tillSignin" },
        ],
    },
    {
        id: "look",
        labelKey: "guide.tour.look",
        minutes: 5,
        offerOn: "/store/edit",
        stops: [
            {
                id: "themes",
                path: "/store/edit",
                href: "/store/edit?screen=brand_kit",
                selector: '[data-testid="brand-theme-gallery"]',
                line: "look.start",
                labelKey: "guide.tour.stop.looks",
            },
        ],
    },
];

/** The staff tour: only the pages a staff member's role can open (filtered by the caller). */
export const STAFF_TOUR_STOPS: readonly TourStop[] = [
    {
        id: "statuses",
        path: "/orders",
        href: "/orders",
        selector: '[data-guide="order-status-tabs"]',
        line: "fo.statuses",
        labelKey: "guide.fo.step.statuses",
    },
    {
        id: "whatsapp",
        path: "/orders",
        href: "/orders",
        selector: '[data-guide="auto-send"]',
        line: "fo.whatsapp",
        labelKey: "guide.fo.step.whatsapp",
    },
    {
        id: "dispatch",
        path: "/printing",
        href: "/printing",
        selector: '[data-guide="desk-print"]',
        line: "fo.dispatch",
        labelKey: "guide.fo.step.dispatch",
    },
];

/** One phase's record in merchant_guide_progress.phases. */
export interface TourRecord {
    started_at?: string;
    /** «بعدين» on the page's offer: never offered again; still in the list. */
    later_at?: string;
    done_at?: string;
    seen?: string[];
}

export function phaseAvailable(phase: TourPhase, facts: GuideShopFacts): boolean {
    return (phase.when?.(facts) ?? true) && phaseStops(phase, facts).length > 0;
}

export function phaseStops(phase: Pick<TourPhase, "stops">, facts: GuideShopFacts): TourStop[] {
    return phase.stops.filter((s) => s.when?.(facts) ?? true);
}

/** The first stop not seen yet; null once all are. */
export function nextTourStop(stops: readonly TourStop[], record: TourRecord | undefined): TourStop | null {
    const seen = new Set(record?.seen ?? []);
    return stops.find((s) => !seen.has(s.id)) ?? null;
}

export function tourDoneCount(stops: readonly TourStop[], record: TourRecord | undefined): number {
    const seen = new Set(record?.seen ?? []);
    return stops.filter((s) => seen.has(s.id)).length;
}

export function tourActive(record: TourRecord | undefined): boolean {
    return !!record?.started_at && !record.done_at;
}

/** The phase to offer on this page, if any: available, never started, offer not dismissed. */
export function tourOfferFor(
    pathname: string,
    records: Partial<Record<TourPhaseId, TourRecord>>,
    facts: GuideShopFacts,
): TourPhase | null {
    return (
        TOUR_PHASES.find((p) => {
            const r = records[p.id];
            return pathname.startsWith(p.offerOn) && phaseAvailable(p, facts) && !r?.started_at && !r?.later_at && !r?.done_at;
        }) ?? null
    );
}

/** Marking a stop seen; the record is done once every stop is. */
export function seeStop(stops: readonly TourStop[], record: TourRecord | undefined, stopId: string, now: string): TourRecord {
    const seen = Array.from(new Set([...(record?.seen ?? []), stopId]));
    const done = stops.every((s) => seen.includes(s.id));
    return { ...record, seen, ...(done ? { done_at: now } : {}) };
}
