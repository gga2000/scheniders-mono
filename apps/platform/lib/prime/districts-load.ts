import type { PrimeClient } from "@/lib/prime/client";

export interface PrimeDistrictOption {
    id: number;
    name: string;
}

/** Prime's district list changes rarely; one read per state serves the day's new orders. */
const TTL_MS = 12 * 3_600_000;
const cache = new Map<string, { districts: PrimeDistrictOption[]; at: number }>();

const byName = new Intl.Collator("ar");

/**
 * Prime's districts of one state, sorted by name, from a twelve-hour cache.
 * Duplicated names (Prime lists a few twice under different ids) keep their
 * first id so the picker shows each place once.
 */
export async function primeDistrictsOf(client: PrimeClient, state: string): Promise<PrimeDistrictOption[]> {
    const cached = cache.get(state);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.districts;
    const seen = new Set<string>();
    const districts: PrimeDistrictOption[] = [];
    for (const d of await client.stateDistricts(state)) {
        const name = d.districtName.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        districts.push({ id: d.districtId, name });
    }
    districts.sort((a, b) => byName.compare(a.name, b.name));
    cache.set(state, { districts, at: Date.now() });
    return districts;
}

/** Test hook: forget the cached lists. */
export function clearPrimeDistrictsCache(): void {
    cache.clear();
}
