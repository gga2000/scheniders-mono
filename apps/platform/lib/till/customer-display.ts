/**
 * The customer screen: a second window on the till PC (dragged to a screen facing
 * the customer) that mirrors the cart, the amount to pay and the change. The till
 * window posts its state on a BroadcastChannel; nothing leaves the device.
 */
import { z } from "zod";
import type { PayMethod } from "@/lib/till/cart";

export const CUSTOMER_CHANNEL = "till-customer-display";

const line = z.object({
    name: z.string(),
    variant: z.string().nullable(),
    quantity: z.number(),
    price: z.number(),
    image: z.string().nullable(),
});

export const displayStateSchema = z.discriminatedUnion("view", [
    z.object({ view: z.literal("idle"), shopName: z.string() }),
    z.object({
        view: z.literal("cart"),
        shopName: z.string(),
        lines: z.array(line),
        subtotal: z.number(),
        discount: z.number(),
        total: z.number(),
    }),
    z.object({
        view: z.literal("pay"),
        shopName: z.string(),
        total: z.number(),
        method: z.enum(["cash", "card", "zaincash", "fib"]),
        /** What is due on this method now (the rest, or the typed part). */
        due: z.number(),
        given: z.number(),
        change: z.number(),
        qr: z.string().nullable(),
    }),
    z.object({ view: z.literal("done"), shopName: z.string(), total: z.number(), change: z.number() }),
]);
export type DisplayState = z.infer<typeof displayStateSchema>;

/** What the pay screen reports up for the customer screen. */
export interface PayShown {
    method: PayMethod;
    due: number;
    given: number;
    change: number;
}

/** Parses a message from the till window; anything else on the channel is ignored. */
export function readDisplayMessage(data: unknown): DisplayState | null {
    const parsed = displayStateSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
}

/** Asks the till window to send its current state again (a customer screen that just opened). */
export const HELLO = "hello";
