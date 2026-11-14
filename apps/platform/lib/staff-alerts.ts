/**
 * Staff WhatsApp Alerts — types, phone normalization, and order-create fanout.
 *
 * Storage shape (in app_settings keyed by 'staff_alert_numbers', tenant-scoped):
 *   { enabled: boolean, numbers: { phone, name?, added_at? }[] }
 *
 * Fanout is invoked from createOrderAction after a successful insert. It is
 * tenant-scoped: the alert allowlist for the order's tenant is fetched and
 * each registered number is sent the `new_order_alert_staff` Interakt
 * template. Failures are logged but do not affect the order creation result.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { sendStaffAlertMessage } from "@/lib/interakt";
import type { Order } from "@/types/order";
import { normalizeIraqiMobile } from "@scheniders/shared";

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

/** An Iraqi mobile in any common form as "964XXXXXXXXXX", or null when it is not one. */
export function iraqMobileE164(raw: string | null | undefined): string | null {
    const local = normalizeIraqiMobile(raw);
    return local ? `964${local.slice(1)}` : null;
}

/**
 * Load the staff alert settings (allowlist + toggle) for a specific tenant.
 * Returns a safe default (disabled, empty) if the row is missing or malformed.
 */
export async function getStaffAlertSettings(
    tenantId: string | null,
): Promise<StaffAlertSettings> {
    if (!tenantId) return { enabled: false, numbers: [] };
    try {
        const supabase = createSupabaseServiceClient();
        const { data } = await supabase
            .from("app_settings")
            .select("value")
            .eq("key", STAFF_ALERT_SETTINGS_KEY)
            .eq("tenant_id", tenantId)
            .maybeSingle();

        const raw = data?.value as Partial<StaffAlertSettings> | undefined;
        const enabled = raw?.enabled === true;
        const numbers = Array.isArray(raw?.numbers) ? (raw!.numbers as StaffNumberEntry[]) : [];

        // Defensive: only keep entries with a valid Iraqi number.
        const cleaned = numbers
            .filter((n): n is StaffNumberEntry => !!n && typeof n.phone === "string")
            .filter((n) => iraqMobileE164(n.phone) !== null);

        return { enabled, numbers: cleaned };
    } catch {
        return { enabled: false, numbers: [] };
    }
}

export interface FanoutResult {
    attempted: number;
    succeeded: number;
    failed: number;
}

/**
 * Fire-and-forget: send the new-order alert template to every registered
 * staff number for the order's tenant. Failures per-recipient are logged
 * but the function never throws to its caller.
 *
 * SAFETY: every recipient phone is re-validated through iraqMobileE164
 * before sending. The allowlist is the source of truth — we do not send
 * to any number absent from the tenant's settings row.
 */
export async function sendNewOrderAlertToStaff(
    order: Order,
    tenantId: string | null,
): Promise<FanoutResult> {
    const result: FanoutResult = { attempted: 0, succeeded: 0, failed: 0 };

    if (!tenantId) return result;

    const settings = await getStaffAlertSettings(tenantId);
    if (!settings.enabled || settings.numbers.length === 0) return result;

    const targets = settings.numbers
        .map((n) => iraqMobileE164(n.phone))
        .filter((p): p is string => p !== null);

    if (targets.length === 0) return result;

    result.attempted = targets.length;

    await Promise.all(
        targets.map(async (phone) => {
            try {
                const r = await sendStaffAlertMessage(order, phone);
                if (r.success) result.succeeded++;
                else {
                    result.failed++;
                    console.warn(`[staff-alerts] send failed to ${phone}:`, r.error);
                }
            } catch (err) {
                result.failed++;
                console.warn(`[staff-alerts] send threw for ${phone}:`, err);
            }
        }),
    );

    return result;
}
