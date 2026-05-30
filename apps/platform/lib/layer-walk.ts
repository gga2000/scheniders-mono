// =====================================================================
// layer-walk — turn a section's rendered DOM into a Layers list
// =====================================================================
// Walks the DOM of a section wrapper (anything with `data-section-id`)
// and harvests every descendant carrying `data-i18n-field` or
// `data-layer`. Each match becomes a `Layer` row in the Layers strip
// rendered above the section's property accordion in the Inspector.
//
// Layer "kind" drives the icon:
//   text   — `[data-i18n-field]` (or `[data-layer-kind="text"]`)
//   image  — `[data-layer-kind="image"]` or auto-detected from <img> tag
//   button — `[data-layer-kind="button"]` or auto-detected from <button>
//   group  — anything else under `[data-layer]`
// =====================================================================

export type LayerKind = "text" | "image" | "button" | "group";

export interface Layer {
    /** Stable key for React lists. */
    key: string;
    /** Human label shown in the row. */
    label: string;
    /** Field-shape kind — drives the icon and click behaviour. */
    kind: LayerKind;
    /**
     * For text layers, the i18n field path (matches data-i18n-field).
     * Empty for non-text rows; the row will scroll the AutoForm field
     * into view instead of entering inline-edit.
     */
    field?: string;
    /**
     * For `[data-layer]` rows, the value of the attribute (so we can
     * scroll/focus the matching AutoForm field).
     */
    layerId?: string;
    /** Source element — used by the hover outline imperative toggle. */
    el: HTMLElement;
}

/** Convert a path like `cta_label_i18n` or `items[0].q_i18n` to a label. */
export function humaniseFieldPath(field: string): string {
    // Strip array indexers for the label.
    const cleaned = field.replace(/\[\d+\]/g, "").replace(/\.+/g, " ");
    return cleaned
        .replace(/_i18n$/g, "")
        .replace(/_/g, " ")
        .replace(/\bid\b/gi, "ID")
        .replace(/\bcta\b/gi, "CTA")
        .replace(/\burl\b/gi, "URL")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

function detectKind(el: HTMLElement): LayerKind {
    const explicit = el.getAttribute("data-layer-kind");
    if (
        explicit === "text" ||
        explicit === "image" ||
        explicit === "button" ||
        explicit === "group"
    ) {
        return explicit;
    }
    if (el.hasAttribute("data-i18n-field")) return "text";
    const tag = el.tagName.toLowerCase();
    if (tag === "img" || el.querySelector(":scope > img")) return "image";
    if (tag === "button" || tag === "a") return "button";
    return "group";
}

/**
 * Walk `root` and return every descendant Layer in document order.
 * The same element can carry both `data-layer` AND `data-i18n-field` —
 * we emit at most one row per element, preferring the i18n route since
 * that's what enables inline-edit.
 */
export function findLayers(root: HTMLElement | null): Layer[] {
    if (!root) return [];

    const matches = root.querySelectorAll<HTMLElement>(
        "[data-i18n-field], [data-layer]",
    );
    const out: Layer[] = [];
    const seen = new WeakSet<HTMLElement>();

    matches.forEach((el, idx) => {
        if (seen.has(el)) return;
        seen.add(el);

        const field = el.getAttribute("data-i18n-field") ?? undefined;
        const layerId = el.getAttribute("data-layer") ?? undefined;
        const labelAttr = el.getAttribute("data-layer-label");

        const kind = detectKind(el);

        let label = labelAttr ?? "";
        if (!label && field) label = humaniseFieldPath(field);
        if (!label && layerId) label = humaniseFieldPath(layerId);
        if (!label) label = `Layer ${idx + 1}`;

        out.push({
            key: `${field ?? layerId ?? "layer"}-${idx}`,
            label,
            kind,
            field,
            layerId,
            el,
        });
    });

    return out;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Hover-outline imperative helpers                                     */
/* ─────────────────────────────────────────────────────────────────── */

const HOVER_ATTR = "data-layer-hover";

export function applyLayerHover(el: HTMLElement | null | undefined): void {
    if (!el) return;
    el.setAttribute(HOVER_ATTR, "true");
}

export function clearLayerHover(el: HTMLElement | null | undefined): void {
    if (!el) return;
    el.removeAttribute(HOVER_ATTR);
}

/** Sweep any leftover hover marks under `root` (e.g. on unmount). */
export function clearAllLayerHovers(root: HTMLElement | Document | null): void {
    if (!root) return;
    const all = root.querySelectorAll(`[${HOVER_ATTR}]`);
    all.forEach((el) => (el as HTMLElement).removeAttribute(HOVER_ATTR));
}
