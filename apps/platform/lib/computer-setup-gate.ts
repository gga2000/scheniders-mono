// =====================================================================
// Setup on a computer: who sees the phone's waiting screen (Ali, 28 Nov)
// =====================================================================
// Most merchants sign up on a phone, from an ad. Setting a shop up is easier
// on a big screen, so a new shop's owner on a phone sees one screen asking to
// carry on on a laptop or iPad (components/computer-setup). The phone follows
// the basics as they are done there and opens the app once they all are.
//
//   app    the app as usual
//   wait   the screen, while what decides it loads
//   setup  the screen: carry on on a computer
//   ready  the basics are done: one "your shop is ready" moment, then the app
//
// Only the owner (admin) of a shop made from PHONE_SETUP_SINCE on, on a phone.
// Every shop older than that, staff, the demo store and a support view never
// see it. Tablets count as computers (lib/computer-sign-in.ts isPhoneScreen).
// =====================================================================

import { FOUNDATION_STEPS, type FoundationStatus } from "@/lib/merchant-guide/foundation";

/** Shops made from this moment on (the day it shipped) set up on a computer. */
export const PHONE_SETUP_SINCE = "2026-11-28T16:00:00Z";

export type ComputerSetupGate = "app" | "wait" | "setup" | "ready";

export interface ComputerSetupGateInput {
    /** Null until the screen is known. */
    phone: boolean | null;
    isAdmin: boolean;
    supportView: boolean;
    /** Null until the shop is loaded. */
    shop: { createdAt: string; isDemo: boolean } | null;
    /** This phone opened the app for this shop before (lib/computer-setup-hints.ts). */
    openHint: boolean;
    /** The owner's guide row; undefined while it loads, null when there is none yet. */
    progress:
        | undefined
        | null
        | { foundationDone: boolean; phoneOpen: boolean; phoneSetup: boolean };
    /** The basics read from the shop; null while they load. */
    status: FoundationStatus | null;
}

/** Whether this person on this device is one the screen is for at all. */
export function mayNeedComputerSetup(input: Pick<ComputerSetupGateInput, "phone" | "isAdmin" | "supportView" | "shop">): boolean {
    const { phone, isAdmin, supportView, shop } = input;
    if (phone !== true || !isAdmin || supportView || !shop || shop.isDemo) return false;
    return Date.parse(shop.createdAt) >= Date.parse(PHONE_SETUP_SINCE);
}

export function computerSetupGate(input: ComputerSetupGateInput): ComputerSetupGate {
    if (!mayNeedComputerSetup(input) || input.openHint) return "app";
    if (input.progress === undefined) return "wait";
    if (input.progress?.phoneOpen || input.progress?.phoneSetup) return "app";
    if (input.progress?.foundationDone) return "ready";
    if (!input.status) return "wait";
    return basicsDone(input.status) ? "ready" : "setup";
}

export function basicsDone(status: FoundationStatus): boolean {
    return FOUNDATION_STEPS.every((step) => status[step]);
}
