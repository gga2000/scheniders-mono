/**
 * The label on the orders toolbar's date button: a preset name when the range
 * is one ("Today", "Last 7 Days"…), else the date or the date range.
 *
 * The preset the merchant picked wins; without one, the range is matched
 * against the presets. The two disagree on the rolling ranges (the picker's
 * "Last 7 Days" starts 6 days back, the fallback 7) and both are kept, so a
 * saved range keeps the label it always had. Dates read in the page's
 * language, with Latin digits as elsewhere in the app.
 */
type Translate = (key: string) => string;

const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysBack = (now: Date, n: number) => {
    const d = new Date(now);
    d.setDate(now.getDate() - n);
    return ymd(d);
};

const yearBack = (now: Date) => {
    const d = new Date(now);
    d.setFullYear(now.getFullYear() - 1);
    return ymd(d);
};

const weekStart = (now: Date) => daysBack(now, now.getDay());
const monthStart = (now: Date) => ymd(new Date(now.getFullYear(), now.getMonth(), 1));
const yearStart = (now: Date) => ymd(new Date(now.getFullYear(), 0, 1));

/** What each picker preset covers, as [from, to]. */
const PRESET_RANGES: Record<string, (now: Date) => [string, string]> = {
    today: (now) => [ymd(now), ymd(now)],
    yesterday: (now) => [daysBack(now, 1), daysBack(now, 1)],
    thisWeek: (now) => [weekStart(now), ymd(now)],
    thisMonth: (now) => [monthStart(now), ymd(now)],
    thisYear: (now) => [yearStart(now), ymd(now)],
    last7: (now) => [daysBack(now, 6), ymd(now)],
    last30: (now) => [daysBack(now, 29), ymd(now)],
    pastYear: (now) => [yearBack(now), ymd(now)],
};

/** Ranges recognised without a preset, in priority order. */
const GUESSED: Array<[string, (now: Date) => [string, string]]> = [
    ["today", PRESET_RANGES.today],
    ["yesterday", PRESET_RANGES.yesterday],
    ["thisWeek", PRESET_RANGES.thisWeek],
    ["thisMonth", PRESET_RANGES.thisMonth],
    ["thisYear", PRESET_RANGES.thisYear],
    ["last7", (now) => [daysBack(now, 7), ymd(now)]],
    ["last30", (now) => [daysBack(now, 30), ymd(now)]],
    ["pastYear", PRESET_RANGES.pastYear],
];

export function ordersDateLabel(
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    preset: string | null | undefined,
    t: Translate,
    language: "ar" | "en",
    now: Date = new Date(),
): string {
    if (!dateFrom) return t("orders.dateLabel.all");
    const to = dateTo || dateFrom;
    const matches = ([f, tt]: [string, string]) => dateFrom === f && to === tt;

    if (preset && PRESET_RANGES[preset] && matches(PRESET_RANGES[preset](now))) {
        return t(`orders.dateLabel.${preset}`);
    }
    for (const [key, range] of GUESSED) {
        if (matches(range(now))) return t(`orders.dateLabel.${key}`);
    }
    const locale = language === "ar" ? "ar-IQ-u-nu-latn" : "en-US";
    const show = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" });
    return dateFrom === to ? show(dateFrom) : `${show(dateFrom)} — ${show(to)}`;
}

/** Picker presets a dashboard link may name (packages/ui DateRangePicker ids). */
const DRILL_PRESETS: ReadonlySet<string> = new Set(["today", "last7", "last30"]);
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface DrillDays {
    from: string | undefined;
    to: string | undefined;
    preset: string | null;
}

/**
 * The days a dashboard link asks Orders to show (ordersDrillQuery): `from`/`to`
 * Baghdad day keys with the picker preset that names them, or `dates=all` for
 * every day. Null when the link names no days, so Orders keeps its own.
 */
export function drillDays(params: URLSearchParams): DrillDays | null {
    if (params.get("dates") === "all") return { from: undefined, to: undefined, preset: null };
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to || !DAY_KEY.test(from) || !DAY_KEY.test(to) || from > to) return null;
    const preset = params.get("preset");
    return { from, to, preset: preset && DRILL_PRESETS.has(preset) ? preset : null };
}
