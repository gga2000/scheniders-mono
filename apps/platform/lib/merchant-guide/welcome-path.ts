// The path the welcome screen draws under its two questions: the basics,
// the first order, and the phases the answers add (a shop till, a team).
// It reads the same phase list as the «دليلك» corner list, so it never
// promises a phase the merchant won't get.

import { TOUR_PHASES, phaseAvailable, type GuideShopFacts } from "./tours";

/** About how long the four basics take a first-time merchant. */
export const BASICS_MINUTES = 6;
export const FIRST_ORDER_MINUTES = 4;

export interface WelcomePathRow {
    id: string;
    labelKey: string;
    minutes: number;
    /** Added by an answer on this screen. */
    added: boolean;
}

export interface WelcomePath {
    rows: WelcomePathRow[];
    /** The other phases, waiting in «دليلك». */
    more: number;
}

/** Link facts are unknown before the basics; they never add or remove a phase here. */
export function welcomePath(answers: { inShop: boolean | null; staff: boolean | null }): WelcomePath {
    const facts: GuideShopFacts = {
        inShop: answers.inShop === true,
        staff: answers.staff === true,
        primeLinked: false,
        adsLinked: false,
    };
    const added = TOUR_PHASES.filter((p) => p.when && phaseAvailable(p, facts));
    const always = TOUR_PHASES.filter((p) => !p.when);
    return {
        rows: [
            { id: "basics", labelKey: "guide.welcome.basics", minutes: BASICS_MINUTES, added: false },
            { id: "first_order", labelKey: "guide.phase.firstOrder", minutes: FIRST_ORDER_MINUTES, added: false },
            ...added.map((p) => ({ id: p.id, labelKey: p.labelKey, minutes: p.minutes, added: true })),
        ],
        more: always.length,
    };
}
