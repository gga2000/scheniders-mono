import type { CartLine } from "@/lib/till/cart";

/** One customer's sale in progress. Held sales are tickets waiting in tabs. */
export interface Ticket {
    /** Also the sale's idempotency key: a retried sale is never made twice. */
    id: string;
    cart: CartLine[];
    customerName: string;
    /** As typed; normalised when the sale is made. */
    phone: string;
    discount: number;
    /** A manager's PIN OK for going over the cashier's discount limit, used by this sale. */
    approval: TicketApproval | null;
    createdAt: number;
}

/** What the manager allowed: up to maxOff (price cuts + discount), until expiresAt (ms). */
export interface TicketApproval {
    id: string;
    managerName: string;
    maxOff: number;
    expiresAt: number;
}

/** How long a manager's OK lasts; matches till_approve on the server. Long enough for a slow FIB payment; the amount is locked anyway. */
export const APPROVAL_MS = 15 * 60 * 1000;

/** The approval still covers this much off and has not run out. */
export function approvalCovers(a: TicketApproval | null, off: number, now: number): boolean {
    return a !== null && off <= a.maxOff && now < a.expiresAt;
}

/** Time left on an approval as m:ss, never below 0:00 and never above the full 15 minutes. */
export function approvalClock(ms: number): string {
    const s = Math.max(0, Math.ceil(Math.min(APPROVAL_MS, ms) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Chip colours as the approval runs out: calm, then amber under 2 minutes, then red under 30 seconds. */
export function approvalTone(ms: number): string {
    if (ms < 30_000) return "bg-red-100 text-red-900";
    if (ms < 120_000) return "bg-amber-200 text-amber-950";
    return "bg-[#B8E8E0] text-[#1E1E1E]";
}

export function newTicket(): Ticket {
    return { id: crypto.randomUUID(), cart: [], customerName: "", phone: "", discount: 0, approval: null, createdAt: Date.now() };
}
