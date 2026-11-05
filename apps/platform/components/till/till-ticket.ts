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
    approval: { id: string; managerName: string } | null;
    createdAt: number;
}

export function newTicket(): Ticket {
    return { id: crypto.randomUUID(), cart: [], customerName: "", phone: "", discount: 0, approval: null, createdAt: Date.now() };
}
