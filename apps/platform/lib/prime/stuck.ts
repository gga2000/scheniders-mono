import type { PrimeBoard } from "@/lib/prime/board";

/** The parcels with no move at Prime for 3+ days, as the home page's alert tells them. */
export interface PrimeStuck {
    count: number;
    /** What Prime should collect for them. */
    cash: number;
    /** The governorate holding most of them, when it holds two or more. */
    city: { name: string; count: number } | null;
}

/**
 * The board's stuck parcels (reason "stuck": open, nothing moved at Prime for
 * three days), with their cash and where most of them are. Null when none is
 * stuck, so the alert stays away.
 */
export function primeStuckSummary(
    board: PrimeBoard,
    cash: ReadonlyMap<string, number>,
    cityOf: (orderId: string) => string | null | undefined,
): PrimeStuck | null {
    const ids = board.lists.needs.filter((id) => board.reasons.get(id) === "stuck");
    if (ids.length === 0) return null;

    const byCity = new Map<string, number>();
    let total = 0;
    for (const id of ids) {
        total += cash.get(id) ?? 0;
        const name = cityOf(id)?.trim();
        if (name) byCity.set(name, (byCity.get(name) ?? 0) + 1);
    }
    let city: PrimeStuck["city"] = null;
    for (const [name, count] of byCity) {
        if (count >= 2 && (!city || count > city.count)) city = { name, count };
    }
    return { count: ids.length, cash: total, city };
}
