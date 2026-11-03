import { cleanPhoneForExport } from "@/lib/shipping/courier-sheets";

/** 07xxxxxxxxx, the 11 digits Prime requires, or null. Client-safe (the order card's resend form checks with it). */
export function primePhone(phone: string | null | undefined): string | null {
    const local = cleanPhoneForExport(phone ?? "");
    return /^7\d{9}$/.test(local) ? `0${local}` : null;
}

/** How many digits the phone has once cleaned, the way Prime counts them («10 digits · Prime needs 11»). */
export function primePhoneDigits(phone: string | null | undefined): number {
    const local = cleanPhoneForExport(phone ?? "");
    return local.length + (local.startsWith("7") ? 1 : 0);
}
