// =====================================================================
// Store template — Soft («ناعم»)
// =====================================================================
// The look every new shop opens on. Warm light page, near-black buttons,
// Readex Pro headlines over IBM Plex Sans Arabic text, soft round cards.
//
// It is the Signature direction's section stacks (the parts that run
// Scheniders' own store every day) with a neutral kit and no stock
// photography: Signature's photos are perfume bottles, which read as
// another shop's goods on a toy, phone or clothes store. The sections that
// exist only to carry those photos are left out, and photo fields on the
// rest are cleared, so the shop's own product photos are the only pictures
// a shopper sees. Icons (trust row, pillars, FAQ) are generic and stay.
// =====================================================================

import type { PageId, SectionInstance } from "@scheniders/shared";
import type { StoreTemplate } from "./types";
import { tplId } from "./types";
import { buildSignatureDirection } from "./scheniders-signature";
import { generalPack } from "./content-packs/general";

export const SOFT_LIGHT_ID = "soft_light";

/** Sections whose whole job is a stock photo. */
const PHOTO_SECTIONS = new Set(["category_spotlight_pair", "collection_trio", "about_spotlight"]);

/** Photo fields on sections that also stand without one. */
const PHOTO_FIELDS = ["bg_image_url", "side_image_left_url", "side_image_right_url"];

function softSection(section: SectionInstance, n: number): SectionInstance {
    const base = { ...section.base };
    for (const field of PHOTO_FIELDS) delete base[field];
    return { ...section, id: tplId(SOFT_LIGHT_ID, n), base };
}

function buildSoftLight(): StoreTemplate {
    const signature = buildSignatureDirection(generalPack);
    let n = 0;
    const restack = (stack: SectionInstance[]) =>
        stack.filter((s) => !PHOTO_SECTIONS.has(s.type)).map((s) => softSection(s, ++n));

    const pages: StoreTemplate["pages"] = {};
    for (const [pageId, stack] of Object.entries(signature.pages) as Array<[PageId, SectionInstance[]]>) {
        pages[pageId] = restack(stack);
    }

    return {
        id: SOFT_LIGHT_ID,
        version: 1,
        name_i18n: { en: "Soft", ar: "ناعم" },
        description_i18n: {
            en: "Warm light page, dark buttons, and your own product photos up front. Fits almost every shop.",
            ar: "خلفية فاتحة ودافية، أزرار غامقة، وصور منتجاتك هي اللي تبيّن. تناسب أغلب المحلات.",
        },
        brand_kit: {
            colors: {
                primary: "#1f1b18",
                secondary: "#1f1b18",
                accent: "#e9dfd0",
                surface: "#f7f3ec",
                surface_alt: "#efe8dc",
                ink: "#1f1b18",
                success: "#2f855a",
                danger: "#c2410c",
            },
            typography: {
                display: "Readex Pro",
                body: "IBM Plex Sans Arabic",
                display_ar: "Readex Pro",
                body_ar: "IBM Plex Sans Arabic",
                scale: "comfortable",
            },
            shape: { radius: "round", border_thickness: "thin", shadow_style: "soft", rotation_intensity: "none" },
            motion: { enabled: true, speed: "normal" },
            voice: { formality: "casual" },
        },
        globals: {
            header: softSection(signature.globals.header, ++n),
            footer: softSection(signature.globals.footer, ++n),
        },
        pages,
    };
}

export const softLightTemplate: StoreTemplate = buildSoftLight();
