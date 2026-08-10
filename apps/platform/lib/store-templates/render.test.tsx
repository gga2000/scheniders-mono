// =====================================================================
// Store templates — rendered-output guards
// =====================================================================
// Renders every store template's home stack through the real section
// components and asserts on the markup that comes out.
//
// These exist because the bugs they catch are invisible to type-checking
// and to the unit tests: a section can be perfectly typed, render fine,
// and still paint a literal white card onto a near-black page. Each
// assertion below corresponds to a defect that actually shipped:
//
//   - `bg-white` / `candy-*` / `shadow-bento-*`: the Candy Bento palette
//     hardwired into sections, which made 2 of the 6 templates unusable.
//   - a filled `bg-bk-*` without its `text-bk-on-*` pair: how Kinetic
//     Ink's hero landed at 1.87:1 and Chrome Night's stat strip at 1:1.
//
// The full check (computed contrast in a browser at 390x844) needs a real
// engine and lives outside CI; this is the part that runs everywhere.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "@scheniders/sections/helpers/store-context";
import { BUILTIN_SECTIONS, type AnySectionDefinition } from "@scheniders/sections";
import { STORE_TEMPLATES } from "./index";

const runtime = {
    page_id: "home" as const,
    breakpoint: "mobile" as const,
    locale: "ar" as const,
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-08-08T00:00:00Z"),
};

const products = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    slug: `p${i}`,
    name: `منتج ${i + 1}`,
    price: 25000 + i * 15000,
    compare_at_price: i % 2 ? 60000 : null,
    images: [],
    image_url: null,
    in_stock: true,
    category_id: `c${i % 2}`,
    description: "وصف",
    sku: `SKU${i}`,
    variants: [],
}));

const categories = Array.from({ length: 3 }, (_, i) => ({
    id: `c${i}`,
    slug: `c${i}`,
    name: ["ملابس", "أحذية", "هدايا"][i],
    image_url: null,
    product_count: 4,
}));

function defOf(type: string): AnySectionDefinition | undefined {
    return (BUILTIN_SECTIONS as AnySectionDefinition[]).find((d) => d.type === type);
}

/** Render one template's home stack to a single markup string. */
function renderHome(templateId: string): string {
    const tpl = STORE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new Error(`unknown template ${templateId}`);
    return (tpl.pages.home ?? [])
        .map((section) => {
            const def = defOf(section.type);
            if (!def) throw new Error(`${templateId}: unknown section ${section.type}`);
            return renderToStaticMarkup(
                React.createElement(
                    StoreBaseProvider,
                    { base: "", children: null } as never,
                    React.createElement(def.render as never, {
                        props: def.defaultProps,
                        ctx: {
                            tenant: { name: "متجر نور" } as never,
                            runtime,
                            products,
                            categories,
                        },
                    } as never),
                ),
            );
        })
        .join("\n");
}

/**
 * Opaque fills and the foreground each one requires.
 *
 * `(?![-/])` excludes both the longer tokens (`bg-bk-ink-soft`) and the
 * alpha-modified ones (`bg-bk-accent/30`). A 30%-alpha accent is a tint
 * blended over the card beneath it, so ink stays the correct foreground
 * there — only opaque fills flip the text colour.
 */
const FILL_PAIRS: Array<{ bg: RegExp; needs: string[] }> = [
    { bg: /\bbg-bk-accent(?![-/\w])/, needs: ["text-bk-on-accent"] },
    { bg: /\bbg-bk-primary(?![-/\w])/, needs: ["text-bk-on-primary"] },
    { bg: /\bbg-bk-ink(?![-/\w])/, needs: ["text-bk-surface", "text-bk-on"] },
];

describe.each(STORE_TEMPLATES.map((t) => t.id))("home render — %s", (id) => {
    it("renders every section in the stack", () => {
        const html = renderHome(id);
        expect(html.length).toBeGreaterThan(0);
    });

    it("carries no hardcoded Candy Bento palette", () => {
        const html = renderHome(id);
        for (const banned of [
            /\bbg-white\b/,
            /\bcandy-(ink|cream|pink|mint|butter|lilac|sky)\b/,
            /\bshadow-bento(-sm|-lg)?\b/,
        ]) {
            expect(html.match(banned)?.[0], `${id} still emits ${banned}`).toBeUndefined();
        }
    });

    it("pairs every filled background with its on-color", () => {
        const html = renderHome(id);
        const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
        const unpaired = classAttrs.filter((cls) =>
            FILL_PAIRS.some(
                ({ bg, needs }) => bg.test(cls) && !needs.some((n) => cls.includes(n)),
            ),
        );
        expect(unpaired, `${id} has filled surfaces with no foreground`).toEqual([]);
    });
});
