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

/** How long a manager's OK lasts; matches till_approve on the server. */
export const APPROVAL_MS = 3 * 60 * 1000;

/** The approval still covers this much off and has not run out. */
export function approvalCovers(a: TicketApproval | null, off: number, now: number): boolean {
    return a !== null && off <= a.maxOff && now < a.expiresAt;
}

export function newTicket(): Ticket {
    return { id: crypto.randomUUID(), cart: [], customerName: "", phone: "", discount: 0, approval: null, createdAt: Date.now() };
}
