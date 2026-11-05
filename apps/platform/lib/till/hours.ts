/** Hours worked at the tills, from clock-in rows. */

export interface ClockRow {
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    auto_closed: boolean;
}

export type Person = { userId: string; minutes: number; days: number; onNow: boolean; forgot: number };

const baghdadDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });

/** Minutes worked, days with a shift, and missed clock-outs per person, from the last 7 days of clock rows. */
export function hoursByPerson(rows: ClockRow[], now: number): Person[] {
    const byUser = new Map<string, { minutes: number; days: Set<string>; onNow: boolean; forgot: number }>();
    for (const r of rows) {
        const p = byUser.get(r.user_id) ?? { minutes: 0, days: new Set<string>(), onNow: false, forgot: 0 };
        const end = r.clock_out ? Date.parse(r.clock_out) : now;
        p.minutes += Math.max(0, Math.round((end - Date.parse(r.clock_in)) / 60_000));
        p.days.add(baghdadDay(r.clock_in));
        if (!r.clock_out) p.onNow = true;
        if (r.auto_closed) p.forgot += 1;
        byUser.set(r.user_id, p);
    }
    return [...byUser.entries()]
        .map(([userId, p]) => ({ userId, minutes: p.minutes, days: p.days.size, onNow: p.onNow, forgot: p.forgot }))
        .sort((a, b) => b.minutes - a.minutes);
}

