import { normalizeIraqiMobile } from "@scheniders/shared";
import { isBusinessTypeId, type BusinessTypeId } from "@/lib/business-types";

/**
 * What usefermi.com's sign-up sheet already asked the owner, handed over in
 * the sign-up link (`?name=`, `?phone=`, `?slug=`, `?sells=`), so the form
 * opens filled in and they are not asked twice.
 */
export interface SignupHandover {
    name: string;
    /** 07XXXXXXXXX, or "" when the link has no usable Iraqi mobile number. */
    phone: string;
    /** The store address chosen there; the form normalises and checks it. */
    slug: string | null;
    /** «شنو تبيع؟» answers, in the order given, unknown ones dropped. */
    sells: BusinessTypeId[];
}

type SearchParams = Record<string, string | string[] | undefined>;

/** A repeated parameter counts by its first value, as URLSearchParams.get reads it. */
function first(params: SearchParams, key: string): string | null {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function readSignupHandover(params: SearchParams): SignupHandover {
    const sells = (first(params, "sells") ?? "").split(",").map((id) => id.trim());
    return {
        name: (first(params, "name") ?? "").trim().slice(0, 120),
        phone: normalizeIraqiMobile(first(params, "phone")) ?? "",
        slug: first(params, "slug"),
        sells: [...new Set(sells.filter(isBusinessTypeId))],
    };
}
