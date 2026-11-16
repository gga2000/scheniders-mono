import type { SupportMessage, SupportSeen } from "@/lib/support/schema";

/**
 * "Seen by Noor": only while the merchant's message is the last word in their
 * latest conversation and a staff member opened it after that message. Once
 * staff reply, the reply says it.
 */
export function seenMark(
    latest: { id: string; staff_seen_at: string | null; staff_seen_name: string | null },
    messages: SupportMessage[],
): SupportSeen | null {
    if (!latest.staff_seen_at || !latest.staff_seen_name) return null;
    const last = messages.filter((m) => m.case_id === latest.id && m.sender_kind !== "system").at(-1);
    if (!last || last.sender_kind !== "merchant") return null;
    if (Date.parse(latest.staff_seen_at) < Date.parse(last.created_at)) return null;
    return { name: latest.staff_seen_name.slice(0, 60), at: latest.staff_seen_at };
}

/**
 * Ask "what happened?" while the latest case carries a No the merchant has not
 * explained yet. An answer to an earlier No does not count for a newer one.
 */
export function askWhy(latest: { rating: string | null; rated_at: string | null; no_reason_at: string | null }): boolean {
    if (latest.rating !== "no" || !latest.rated_at) return false;
    return latest.no_reason_at === null || Date.parse(latest.no_reason_at) < Date.parse(latest.rated_at);
}
