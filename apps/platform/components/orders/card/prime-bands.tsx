"use client";

import { PrimeBand } from "./prime-band";
import { PrimeCallBand } from "./prime-call-band";
import { PrimeQueueBand } from "./prime-queue-band";
import type { OrderCardModel } from "./use-order-card-model";

/**
 * The Prime bands under a card. Handled parcels of a «معالجة» / «راجع» list
 * are folded at the list's bottom (prime-handled-fold), so a card shown here
 * always carries its full bands.
 */
export function PrimeBands({ m }: { m: OrderCardModel }) {
    return (
        <>
            <PrimeBand m={m} />
            <PrimeCallBand m={m} />
            <PrimeQueueBand m={m} />
        </>
    );
}
