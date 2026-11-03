import { z } from "zod";
import type { OrderStatusKey } from "@/lib/order-status-labels";
import { addDaysToDayKey, baghdadDayKey } from "@/lib/order-window";

/**
 * The order history (السجل) feed: what get_order_activity returns, and the
 * pure rules the panel draws it with. Everything here is deterministic and
 * takes `now` explicitly so it can be tested.
 */

const text = z.string().nullish().transform((v) => v ?? null);
const num = z.number().nullish().transform((v) => v ?? null);
const scalar = z.union([z.string(), z.number(), z.boolean()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v)));

const fieldChange = z.object({ f: z.string(), old: scalar, new: scalar });
const flagChange = z.object({ f: z.string(), on: z.boolean().optional(), old: scalar.optional(), new: scalar.optional() });

const base = { id: z.string(), at: z.string(), actor: text };

const rawEventSchema = z.discriminatedUnion("type", [
    z.object({ ...base, type: z.literal("status"), from: text, to: z.string(), notes: text }),
    z.object({ ...base, type: z.literal("note"), text: z.string() }),
    z.object({ ...base, type: z.literal("edit"), data: z.object({ fields: z.array(fieldChange) }) }),
    z.object({ ...base, type: z.literal("flag"), data: z.object({ flags: z.array(flagChange) }) }),
    z.object({ ...base, type: z.literal("label_printed"), data: z.object({ count: num }) }),
    z.object({ ...base, type: z.literal("courier_submitted"), data: z.object({ company: z.string(), tracking: text }) }),
    z.object({ ...base, type: z.literal("courier_status"), data: z.object({ company: z.string(), step: z.string(), status: text.optional() }) }),
    z.object({ ...base, type: z.literal("courier_synced"), data: z.object({ company: z.string() }) }),
    z.object({ ...base, type: z.literal("courier_sync_failed"), data: z.object({ company: z.string(), reason: text }) }),
    z.object({ ...base, type: z.literal("courier_cancelled"), data: z.object({ company: z.string() }) }),
    z.object({ ...base, type: z.literal("courier_resent"), data: z.object({ company: z.string(), tracking: text }) }),
    z.object({ ...base, type: z.literal("payment_checked") }),
    z.object({ ...base, type: z.literal("payment_unchecked") }),
    z.object({ ...base, type: z.literal("refund_status"), data: z.object({ old: text, new: text, amount: num }) }),
    z.object({
        ...base, type: z.literal("whatsapp"),
        data: z.object({ template: text, sent_at: text, delivered_at: text, read_at: text, failed_at: text, reason: text }),
    }),
    z.object({ ...base, type: z.literal("whatsapp_reply"), data: z.object({ button: text, template: text }) }),
    z.object({
        ...base, type: z.literal("related"),
        data: z.object({ order_uuid: z.string(), order_number: text, kind: z.enum(["refund", "replacement", "linked"]) }),
    }),
]);

export const orderActivitySchema = z.object({
    order: z.object({
        created_at: z.string(),
        source: text,
        created_via: text,
        entered_by: text,
        price: num,
        items: text,
        pieces: num,
        is_replacement: z.boolean(),
        is_return: z.boolean(),
        original: z.object({ order_uuid: z.string(), order_number: text }).nullable(),
    }),
    // One unknown or malformed row must not blank the whole history: it is dropped instead.
    events: z.array(z.unknown()).transform((rows) =>
        rows.flatMap((row) => {
            const parsed = rawEventSchema.safeParse(row);
            return parsed.success ? [parsed.data] : [];
        }),
    ),
});

export type OrderActivity = z.infer<typeof orderActivitySchema>;
export type RawActivityEvent = z.infer<typeof rawEventSchema>;
export type FieldChange = { f: string; old: string | null; new: string | null };

/** Who did it, as the feed draws them. */
export type ActorKind = "staff" | "claude" | "automation" | "customer" | "courier";

export type ActivityEvent =
    | { kind: "created"; id: string; at: string; actor: string | null; actorKind: ActorKind }
    | { kind: "status"; id: string; at: string; actor: string | null; actorKind: ActorKind; from: string; to: string; notes: string | null; stayedMs: number | null }
    | { kind: "edit"; id: string; at: string; actor: string | null; actorKind: ActorKind; fields: FieldChange[] }
    | { kind: "flag"; id: string; at: string; actor: string | null; actorKind: ActorKind; flags: z.infer<typeof flagChange>[] }
    | { kind: "note"; id: string; at: string; actor: string | null; actorKind: ActorKind; text: string }
    | { kind: "label_printed"; id: string; at: string; actor: string | null; actorKind: ActorKind; count: number | null }
    | { kind: "courier"; id: string; at: string; actor: string | null; actorKind: ActorKind; action: "submitted" | "status" | "synced" | "sync_failed" | "cancelled" | "resent"; company: string; tracking: string | null; step: string | null; reason: string | null }
    | { kind: "payment"; id: string; at: string; actor: string | null; actorKind: ActorKind; checked: boolean }
    | { kind: "refund"; id: string; at: string; actor: string | null; actorKind: ActorKind; from: string | null; to: string | null; amount: number | null }
    | { kind: "whatsapp"; id: string; at: string; actor: string | null; actorKind: ActorKind; template: string | null; state: "sent" | "delivered" | "read" | "failed"; deliveredAt: string | null; readAt: string | null; reason: string | null }
    | { kind: "whatsapp_reply"; id: string; at: string; actor: string | null; actorKind: ActorKind; button: string | null }
    | { kind: "related"; id: string; at: string; actor: string | null; actorKind: ActorKind; orderUuid: string; orderNumber: string | null; relation: "refund" | "replacement" | "linked" };

export type ActivityFilter = "all" | "status" | "edits" | "whatsapp" | "delivery" | "notes";
export const ACTIVITY_FILTERS: readonly ActivityFilter[] = ["all", "status", "edits", "whatsapp", "delivery", "notes"];

const AUTOMATION_ACTORS = new Set(["automation", "system", "whatsapp_bot", "lightfunnels", "cron"]);
const COURIER_ACTORS = new Set(["prime", "waseet"]);

export function actorKind(actor: string | null | undefined): ActorKind {
    const key = actor?.trim().toLowerCase() ?? "";
    if (!key || AUTOMATION_ACTORS.has(key)) return "automation";
    if (key === "customer") return "customer";
    if (COURIER_ACTORS.has(key)) return "courier";
    if (key.startsWith("claude")) return "claude";
    return "staff";
}

/**
 * Rows written by the browser before the database tracked edits read
 * "Updated: Name: a → b, Secondary Phone: None → None". The labels were fixed
 * English words, so they map back to fields; "None → None" was noise and is
 * dropped. Anything unreadable stays as one row with the raw text.
 */
const LEGACY_LABELS: Record<string, string> = {
    "Name": "customer_name",
    "Phone": "phone",
    "Secondary Phone": "secondary_phone",
    "City": "city",
    "Address": "address",
    "Price": "price",
    "Notes": "notes",
    "Internal Notes": "internal_notes",
    "Priority": "priority",
    "Payment Status": "payment_status",
    "Scheduled Date": "scheduled_date",
    "Order Date": "order_date",
};
const LEGACY_SPLIT = new RegExp(`,\\s*(?=(?:${Object.keys(LEGACY_LABELS).join("|")}|Items updated)\\b)`);

const legacyValue = (v: string): string | null => {
    const trimmed = v.trim();
    return trimmed === "" || trimmed === "None" || trimmed === "null" ? null : trimmed;
};

export function parseLegacyEditNote(notes: string): FieldChange[] {
    const body = notes.replace(/^Updated:\s*/, "");
    const out: FieldChange[] = [];
    for (const part of body.split(LEGACY_SPLIT)) {
        const piece = part.trim();
        if (!piece) continue;
        if (piece === "Items updated") {
            out.push({ f: "items", old: null, new: null });
            continue;
        }
        const colon = piece.indexOf(": ");
        const label = colon > 0 ? piece.slice(0, colon) : "";
        const field = LEGACY_LABELS[label];
        const arrow = piece.indexOf(" → ", colon);
        if (!field || arrow < 0) {
            out.push({ f: "raw", old: null, new: piece });
            continue;
        }
        const oldV = legacyValue(piece.slice(colon + 2, arrow));
        const newV = legacyValue(piece.slice(arrow + 3));
        if (oldV === newV) continue;
        out.push({ f: field, old: oldV, new: newV });
    }
    return out;
}

const time = (iso: string) => Date.parse(iso);

/**
 * Raw rows → the feed, newest first. Status rows gain how long the order sat
 * in the status it left; the creation row becomes `created`; legacy
 * same-status "Updated:" rows become edits (and disappear when nothing really
 * changed).
 */
export function buildActivityFeed(raw: RawActivityEvent[]): ActivityEvent[] {
    const ascending = [...raw].sort((a, b) => time(a.at) - time(b.at));
    const out: ActivityEvent[] = [];
    let lastStatusAt: number | null = null;

    for (const e of ascending) {
        const who = { id: e.id, at: e.at, actor: e.actor, actorKind: actorKind(e.actor) };
        switch (e.type) {
            case "status": {
                if (e.from === null) {
                    out.push({ kind: "created", ...who });
                    lastStatusAt = time(e.at);
                    break;
                }
                if (e.from === e.to) {
                    if (e.notes?.startsWith("Updated:")) {
                        const fields = parseLegacyEditNote(e.notes);
                        if (fields.length > 0) out.push({ kind: "edit", ...who, fields });
                    } else if (e.notes) {
                        out.push({ kind: "note", ...who, text: e.notes });
                    }
                    break;
                }
                const stayed = lastStatusAt === null ? null : time(e.at) - lastStatusAt;
                out.push({ kind: "status", ...who, from: e.from, to: e.to, notes: e.notes, stayedMs: stayed !== null && stayed >= 60_000 ? stayed : null });
                lastStatusAt = time(e.at);
                break;
            }
            case "note":
                out.push({ kind: "note", ...who, text: e.text });
                break;
            case "edit":
                out.push({ kind: "edit", ...who, fields: e.data.fields });
                break;
            case "flag":
                out.push({ kind: "flag", ...who, flags: e.data.flags });
                break;
            case "label_printed":
                out.push({ kind: "label_printed", ...who, count: e.data.count });
                break;
            case "courier_submitted":
            case "courier_resent":
                out.push({ kind: "courier", ...who, action: e.type === "courier_submitted" ? "submitted" : "resent", company: e.data.company, tracking: e.data.tracking, step: null, reason: null });
                break;
            case "courier_status":
                out.push({ kind: "courier", ...who, action: "status", company: e.data.company, tracking: null, step: e.data.step, reason: null });
                break;
            case "courier_synced":
                out.push({ kind: "courier", ...who, action: "synced", company: e.data.company, tracking: null, step: null, reason: null });
                break;
            case "courier_sync_failed":
                out.push({ kind: "courier", ...who, action: "sync_failed", company: e.data.company, tracking: null, step: null, reason: e.data.reason });
                break;
            case "courier_cancelled":
                out.push({ kind: "courier", ...who, action: "cancelled", company: e.data.company, tracking: null, step: null, reason: null });
                break;
            case "payment_checked":
            case "payment_unchecked":
                out.push({ kind: "payment", ...who, checked: e.type === "payment_checked" });
                break;
            case "refund_status":
                out.push({ kind: "refund", ...who, from: e.data.old, to: e.data.new, amount: e.data.amount });
                break;
            case "whatsapp": {
                const d = e.data;
                const state = d.failed_at ? "failed" : d.read_at ? "read" : d.delivered_at ? "delivered" : "sent";
                out.push({ kind: "whatsapp", ...who, template: d.template, state, deliveredAt: d.delivered_at, readAt: d.read_at, reason: d.reason });
                break;
            }
            case "whatsapp_reply":
                out.push({ kind: "whatsapp_reply", ...who, button: e.data.button });
                break;
            case "related":
                out.push({ kind: "related", ...who, orderUuid: e.data.order_uuid, orderNumber: e.data.order_number, relation: e.data.kind });
                break;
        }
    }
    return out.reverse();
}

export function eventFilter(e: ActivityEvent): Exclude<ActivityFilter, "all"> {
    switch (e.kind) {
        case "edit":
        case "flag":
            return "edits";
        case "note":
            return "notes";
        case "whatsapp":
        case "whatsapp_reply":
            return "whatsapp";
        case "label_printed":
        case "courier":
            return "delivery";
        default:
            return "status";
    }
}

export function filterCounts(events: ActivityEvent[]): Record<ActivityFilter, number> {
    const counts: Record<ActivityFilter, number> = { all: events.length, status: 0, edits: 0, whatsapp: 0, delivery: 0, notes: 0 };
    for (const e of events) counts[eventFilter(e)] += 1;
    return counts;
}

/** Newest-first events grouped by Baghdad day, keeping order. */
export function groupByBaghdadDay(events: ActivityEvent[]): { day: string; events: ActivityEvent[] }[] {
    const groups: { day: string; events: ActivityEvent[] }[] = [];
    for (const e of events) {
        const day = baghdadDayKey(time(e.at));
        const last = groups[groups.length - 1];
        if (last && last.day === day) last.events.push(e);
        else groups.push({ day, events: [e] });
    }
    return groups;
}

export type DayLabel = { kind: "today" } | { kind: "yesterday" } | { kind: "date"; day: string };
export function dayLabel(day: string, now: number): DayLabel {
    const today = baghdadDayKey(now);
    if (day === today) return { kind: "today" };
    if (day === addDaysToDayKey(today, -1)) return { kind: "yesterday" };
    return { kind: "date", day };
}

/* ── Journey bar ─────────────────────────────────────────────────────── */

export type JourneyStepState = "done" | "current" | "upcoming" | "stopped";
export interface JourneyStep { status: OrderStatusKey; state: JourneyStepState; at: string | null }

const SALE_PATH: OrderStatusKey[] = ["new", "confirmed", "in_transit", "delivered", "completed"];
const REFUND_PATH: OrderStatusKey[] = ["return_pending", "in_transit", "refund_delivered"];
/** Off the path and final: the bar ends on a stopped step. */
const STOPPED: ReadonlySet<string> = new Set(["cancelled", "rejected", "refund_failed"]);

/**
 * The order's path across the top of the panel. Each reached step carries the
 * first time the order entered it. A status off the path (contacted, no
 * response, cancelled, return pending…) is drawn as the current step right
 * after the last step reached; a final one (cancelled, rejected) ends the bar.
 */
export function buildJourney(status: string, isReturnOrder: boolean, events: ActivityEvent[], createdAt: string): JourneyStep[] {
    const path = isReturnOrder ? REFUND_PATH : SALE_PATH;
    const firstAt = new Map<string, string>();
    const ascending = [...events].reverse();
    for (const e of ascending) {
        if (e.kind === "created" && !firstAt.has(path[0])) firstAt.set(path[0], e.at);
        if (e.kind === "status" && !firstAt.has(e.to)) firstAt.set(e.to, e.at);
    }
    if (!firstAt.has(path[0])) firstAt.set(path[0], createdAt);

    const onPath = path.indexOf(status as OrderStatusKey);
    if (onPath >= 0) {
        return path.map((s, i) => ({
            status: s,
            state: i < onPath ? "done" : i === onPath ? (i === path.length - 1 ? "done" : "current") : "upcoming",
            at: i <= onPath ? firstAt.get(s) ?? null : null,
        }));
    }

    // Off the path: keep the steps the order really passed, then the current status.
    let lastReached = 0;
    path.forEach((s, i) => { if (firstAt.has(s)) lastReached = i; });
    const reached: JourneyStep[] = path.slice(0, lastReached + 1).map((s) => ({ status: s, state: "done", at: firstAt.get(s) ?? null }));
    const stopped = STOPPED.has(status);
    let currentAt: string | null = null;
    for (const e of events) {
        if (e.kind === "status" && e.to === status) { currentAt = e.at; break; }
    }
    const current: JourneyStep = { status: status as OrderStatusKey, state: stopped ? "stopped" : "current", at: currentAt };
    const rest: JourneyStep[] = stopped ? [] : path.slice(lastReached + 1).map((s) => ({ status: s, state: "upcoming", at: null }));
    return [...reached, current, ...rest];
}

/* ── Summary strip ───────────────────────────────────────────────────── */

export interface ActivitySummary {
    /** From creation to now, or to the final status for a closed order. */
    ageMs: number;
    closed: boolean;
    /** Creation → first time confirmed. */
    toConfirmMs: number | null;
    /** First time in transit → delivered, or → now while still out. */
    deliveryMs: number | null;
    deliveryOpen: boolean;
    /** The person with the most actions on the order (staff and Claude only). */
    topActor: { name: string; count: number } | null;
}

const CLOSED: ReadonlySet<string> = new Set(["completed", "cancelled", "rejected", "refund_delivered", "refund_failed"]);
const DELIVERED: ReadonlySet<string> = new Set(["delivered", "completed", "refund_delivered"]);

export function buildSummary(status: string, createdAt: string, events: ActivityEvent[], now: number): ActivitySummary {
    const created = time(createdAt);
    const ascending = [...events].reverse();
    const firstTo = (s: (to: string) => boolean) => ascending.find((e) => e.kind === "status" && s(e.to))?.at ?? null;

    const closed = CLOSED.has(status);
    let closedAt: number | null = null;
    if (closed) {
        for (const e of events) {
            if (e.kind === "status" && e.to === status) { closedAt = time(e.at); break; }
        }
    }
    const confirmedAt = firstTo((to) => to === "confirmed");
    const transitAt = firstTo((to) => to === "in_transit");
    const deliveredAt = firstTo((to) => DELIVERED.has(to));
    const deliveryOpen = status === "in_transit";

    const counts = new Map<string, number>();
    for (const e of events) {
        if ((e.actorKind === "staff" || e.actorKind === "claude") && e.actor) counts.set(e.actor, (counts.get(e.actor) ?? 0) + 1);
    }
    let topActor: ActivitySummary["topActor"] = null;
    for (const [name, count] of counts) {
        if (!topActor || count > topActor.count) topActor = { name, count };
    }

    return {
        ageMs: Math.max(0, (closedAt ?? now) - created),
        closed,
        toConfirmMs: confirmedAt ? Math.max(0, time(confirmedAt) - created) : null,
        deliveryMs: transitAt
            ? Math.max(0, (deliveredAt && time(deliveredAt) >= time(transitAt) ? time(deliveredAt) : deliveryOpen ? now : time(transitAt)) - time(transitAt))
            : null,
        deliveryOpen,
        topActor,
    };
}

/** "3d 4h", "2h 08m", "17m" — or the Arabic "3 ي 4 س". Under a minute reads as "<1m". */
export function formatDuration(ms: number, lang: "en" | "ar"): string {
    const mins = Math.floor(ms / 60_000);
    const u = lang === "ar" ? { d: "ي", h: "س", m: "د" } : { d: "d", h: "h", m: "m" };
    const sep = lang === "ar" ? " " : "";
    if (mins < 1) return lang === "ar" ? "أقل من دقيقة" : "<1m";
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const rest = mins % 60;
    if (days > 0) return hours > 0 ? `${days}${sep}${u.d} ${hours}${sep}${u.h}` : `${days}${sep}${u.d}`;
    if (hours > 0) return `${hours}${sep}${u.h} ${String(rest).padStart(2, "0")}${sep}${u.m}`;
    return `${rest}${sep}${u.m}`;
}
