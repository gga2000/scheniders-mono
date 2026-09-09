// =====================================================================
// Section field widgets — Schneiders Builder v2
// =====================================================================
// Decides when a section prop deserves a resource picker instead of a
// text box. Section props carry raw references — 13 `product_id` fields,
// three multi-id fields, `category_slug`, and 24 `*_href` — and until now
// every one of them was edited by typing a UUID or a path by hand.
//
// Classification is CONVENTION-BASED on the field name, exactly like
// `section-field-groups.ts`. That is deliberate: a per-section registry
// only helps the sections someone remembered to annotate, while a naming
// convention covers every section that already exists and every one added
// later, without touching a single section file (and therefore without
// touching a single Zod schema — see constraint 3 in the program plan).
// =====================================================================

export type FieldWidget =
    /** One product. Stores the product id. */
    | { kind: "product"; multiple: false }
    /** Several products, in the merchant's chosen order. Stores ids. */
    | { kind: "product"; multiple: true }
    /** Several categories. Stores ids. */
    | { kind: "category"; multiple: true; stores: "id" }
    /** One category, stored by slug (what the storefront routes on). */
    | { kind: "category"; multiple: false; stores: "slug" }
    /** A destination: a store page, a category, a product, or a URL. */
    | { kind: "link" };

/**
 * Fields whose name ends in `_href` but which are NOT navigable
 * destinations, so the link picker would be wrong for them.
 */
const HREF_EXCEPTIONS = new Set<string>([]);

export function resolveFieldWidget(fieldKey: string): FieldWidget | null {
    const key = fieldKey.toLowerCase();

    if (key === "product_id") return { kind: "product", multiple: false };
    if (key.endsWith("product_ids")) return { kind: "product", multiple: true };
    if (key.endsWith("category_ids")) return { kind: "category", multiple: true, stores: "id" };
    if (key === "category_slug") return { kind: "category", multiple: false, stores: "slug" };
    if (key === "href" || (key.endsWith("_href") && !HREF_EXCEPTIONS.has(key))) {
        return { kind: "link" };
    }
    return null;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Link destinations                                                    */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * The store pages a merchant can link to. Paths are storefront-relative,
 * matching what sections already store in `cta_href` today, so switching a
 * field to the picker never rewrites an existing value.
 */
export const LINK_PAGES = [
    { path: "/", labelKey: "home" },
    { path: "/products", labelKey: "products" },
    { path: "/cart", labelKey: "cart" },
    { path: "/checkout", labelKey: "checkout" },
    { path: "/track", labelKey: "track" },
    { path: "/about", labelKey: "about" },
    { path: "/faq", labelKey: "faq" },
    { path: "/contact", labelKey: "contact" },
    { path: "/policies/shipping", labelKey: "policyShipping" },
    { path: "/policies/returns", labelKey: "policyReturns" },
    { path: "/policies/privacy", labelKey: "policyPrivacy" },
    { path: "/policies/terms", labelKey: "policyTerms" },
] as const;

export type LinkTargetKind = "page" | "category" | "product" | "external";

/** What an existing href value already points at, so the picker opens on it. */
export function classifyHref(href: string | undefined): {
    kind: LinkTargetKind;
    /** Slug for category/product, the raw value otherwise. */
    value: string;
} {
    const raw = (href ?? "").trim();
    if (!raw) return { kind: "page", value: "" };
    if (/^(https?:)?\/\//i.test(raw) || /^(mailto|tel|whatsapp):/i.test(raw)) {
        return { kind: "external", value: raw };
    }
    const categoryMatch = /^\/categories\/([^/?#]+)/.exec(raw);
    if (categoryMatch) return { kind: "category", value: decodeURIComponent(categoryMatch[1]) };
    const productMatch = /^\/(?:products|p)\/([^/?#]+)/.exec(raw);
    if (productMatch) return { kind: "product", value: decodeURIComponent(productMatch[1]) };
    if (raw.startsWith("/")) return { kind: "page", value: raw };
    // A bare word is neither a path nor a URL — treat it as external so the
    // merchant sees exactly what is stored rather than a silent rewrite.
    return { kind: "external", value: raw };
}

/** Build the href a chosen destination should store. */
export function buildHref(kind: LinkTargetKind, value: string): string {
    const v = value.trim();
    if (!v) return "";
    switch (kind) {
        case "category":
            return `/categories/${v}`;
        case "product":
            return `/products/${v}`;
        case "page":
        case "external":
            return v;
    }
}
