"use client";

import { usePrimeConnection } from "@/hooks/use-prime-link";
import { usePrimeShipments } from "@/hooks/use-prime-shipments";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import type { Order } from "@/types/order";

/** Orders whose parcel is still out with Prime: the only cards that get the band. */
export const PRIME_BAND_ORDER_STATUSES: ReadonlySet<string> = new Set(["confirmed", "in_transit"]);

export interface PrimeBandState {
    /** The order's Prime parcel; null when Prime never got it. */
    view: PrimeShipmentView | null;
    /** The card can carry the band: the tenant ships through the Prime API and this parcel is out with Prime. */
    available: boolean;
    /** The band is showing (the "Prime track on cards" switch, unless this card's truck button flipped it). */
    shown: boolean;
    /** The Prime branch the parcels go through («فرع الكوت»); null when not set. */
    branchName: string | null;
    toggle: () => void;
}

/**
 * Whether an order card shows its Prime band, shared by the band, the truck
 * button in the card's action capsule and the Prime chip (which steps aside
 * while the band shows the same parcel). Hidden for tenants without a
 * switched-on Prime link.
 */
export function usePrimeBand(order: Pick<Order, "id" | "status">): PrimeBandState {
    const { connected, branchName } = usePrimeConnection();
    const view = usePrimeShipments().get(order.id) ?? null;
    const showAll = useOrderStore((s) => s.primeTrackOnCards);
    const override = useOrderStore((s) => s.primeTrackOverrides[order.id]);
    const setOverride = useOrderStore((s) => s.setPrimeTrackOverride);
    const available = connected && view !== null && view.cancelledAt === null && PRIME_BAND_ORDER_STATUSES.has(order.status);
    const shown = available && (override ?? showAll);
    return { view, available, shown, branchName, toggle: () => setOverride(order.id, !shown) };
}
