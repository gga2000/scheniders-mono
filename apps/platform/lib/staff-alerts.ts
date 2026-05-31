/**
 * Staff WhatsApp Alerts — types + phone normalization.
 *
 * Storage shape (in app_settings keyed by 'staff_alert_numbers', tenant-scoped):
 *   { enabled: boolean, numbers: { phone, name?, added_at? }[] }
 *
 * NOTE: this module ships only the types + normalizer needed by the settings
 * UI and the API route. The order-create fanout (sending the "new order"
 * template to each registered staff number) requires extending lib/interakt
 * with sendStaffAlertMessage + the staff_alert_new_order template — that's a
 * separate PR.
 */

export const STAFF_ALERT_SETTINGS_KEY = "staff_alert_numbers";

export interface StaffNumberEntry {
    phone: string;
    name?: string;
    added_at?: string;
}

export interface StaffAlertSettings {
    enabled: boolean;
    numbers: StaffNumberEntry[];
}

/**
 * Normalize an Iraqi phone (any common format) to canonical "964XXXXXXXXXX".
 * Returns null if the input doesn't look like an Iraqi mobile.
 */
export function normalizeIraqiPhone(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== "string") return null;

    let s = raw.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());
    s = s.replace(/\D/g, "");

    if (s.startsWith("00964")) s = s.slice(5);
    else if (s.startsWith("964")) s = s.slice(3);
    if (s.startsWith("0")) s = s.slice(1);

    // Iraqi mobiles are 10 digits after the leading 0 / country code.
    // Mobile prefixes start with 7.
    if (s.length !== 10 || !s.startsWith("7")) return null;

    return `964${s}`;
}
