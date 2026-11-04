import { z } from "zod";
import { normalizeArabic } from "@scheniders/shared";
import { toOmsGovernorateCode } from "@scheniders/shared/governorates";
import { courierGovernorateCode, type CourierSheetOrder } from "@/lib/shipping/courier-sheets";
import type { Order } from "@/types/order";

/** orders.prime_district: one district from Prime's list (the column's CHECK holds the same shape). */
export const primeDistrictSchema = z.object({
    id: z.number().int().positive().max(999_999_999),
    name: z.string().trim().min(1).max(100),
    state: z.string().regex(/^[A-Z]{2,8}$/),
}) satisfies z.ZodType<NonNullable<Order["prime_district"]>>;

export type PrimeDistrict = z.infer<typeof primeDistrictSchema>;

/** The stored district, or null when there is none or it is not the shape Prime takes. */
export function readPrimeDistrict(raw: unknown): PrimeDistrict | null {
    const parsed = primeDistrictSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}

/** Prime's state code for an order's governorate (Prime's 18 codes are our governorates' OMS codes); null when it has none. */
export function primeStateOf(order: Pick<CourierSheetOrder, "city" | "governorate_code" | "validated_governorate_code" | "address_details">): string | null {
    return toOmsGovernorateCode(courierGovernorateCode(order)) || null;
}

/**
 * The district id to send with a shipment going to `state`: the picked
 * district only while it belongs to that state. A district picked before the
 * governorate was changed is left out rather than sent to the wrong state.
 */
export function primeDistrictIdFor(raw: unknown, state: string): number | undefined {
    const district = readPrimeDistrict(raw);
    return district && district.state === state ? district.id : undefined;
}

/**
 * The order's picked district while it still belongs to the order's
 * governorate, else null: what is saved with a new order, so a district picked
 * before the governorate changed is never stored against the wrong one.
 */
export function primeDistrictOfOrder(
    order: Pick<CourierSheetOrder, "prime_district" | "city" | "governorate_code" | "validated_governorate_code" | "address_details">,
): PrimeDistrict | null {
    const district = readPrimeDistrict(order.prime_district);
    return district && district.state === primeStateOf(order) ? district : null;
}

/** A name or address folded for matching: Arabic spelling variants folded, punctuation as spaces. */
export function foldPrimePlace(text: string): string {
    return normalizeArabic(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Prime districts named, as whole words, in the typed address: longest name
 * first (then the one written first), and a name inside a longer match left out («الجهاد الثانية» rather
 * than also «الجهاد»). Offered as a one-tap pick; nothing is chosen for the user.
 */
export function primeDistrictsInAddress<T extends { name: string }>(address: string, districts: readonly T[], max = 2): T[] {
    const text = ` ${foldPrimePlace(address)} `;
    if (text.trim() === "") return [];
    const hits = districts
        .map((d) => {
            const key = foldPrimePlace(d.name);
            return { d, key, at: key.length >= 3 ? text.indexOf(` ${key} `) : -1 };
        })
        .filter((hit) => hit.at >= 0)
        .sort((a, b) => b.key.length - a.key.length || a.at - b.at);
    const picked: { d: T; key: string; at: number }[] = [];
    for (const hit of hits) {
        if (picked.length >= max) break;
        if (!picked.some((p) => ` ${p.key} `.includes(` ${hit.key} `))) picked.push(hit);
    }
    return picked.map((p) => p.d);
}
