// =====================================================================
// Store templates — rendered-output guards
// =====================================================================
// Renders every page each store template seeds through the real section
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
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "@scheniders/sections/helpers/store-context";
import {
    BUILTIN_SECTIONS,
    getSection,
    listSections,
    type AnySectionDefinition,
    type Category,
    type Product,
    type SectionRenderContext,
    type SectionTenant,
} from "@scheniders/sections";
import { resolveSection, type PageId } from "@scheniders/shared";
import { STORE_TEMPLATES } from "./index";

const runtime = {
    page_id: "home" as const,
    breakpoint: "mobile" as const,
    locale: "ar" as const,
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-08-08T00:00:00Z"),
};

const tenant: SectionTenant = {
    id: "tenant-render-guard",
    business_name: "متجر نور",
    slug: "noor",
    status: "active",
    branding: {},
};

const products: Product[] = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    slug: `p${i}`,
    name: `منتج ${i + 1}`,
    price: 25000 + i * 15000,
    compare_at_price: i % 2 ? 60000 : null,
    images: [],
    image_url: null,
    stock_quantity: 10,
    reserved_quantity: 0,
    is_archived: false,
    category_id: `c${i % 2}`,
    description: "وصف",
    sku: `SKU${i}`,
}));

function category(i: number): Category {
    return {
        id: `c${i}`,
        tenant_id: tenant.id,
        name: ["ملابس", "أحذية", "هدايا"][i] ?? `فئة ${i}`,
        name_ar: null,
        name_en: null,
        slug: `c${i}`,
        scope: "both",
        description: null,
        description_ar: null,
        description_en: null,
        image_url: null,
        banner_url: null,
        accent_color: null,
        icon: null,
        parent_id: null,
        display_order: i,
        is_visible: true,
        status: "published",
        published_at: null,
        unpublish_at: null,
        archived_at: null,
        show_in_main_nav: true,
        show_in_mega_menu: false,
        show_in_mobile_drawer: true,
        nav_variant: "pills",
        page_config: {
            layout: "grid",
            products_per_page: 24,
            default_sort: "manual",
            filters_enabled: [],
        },
        page_config_draft: null,
        meta_title: null,
        meta_description: null,
        og_image_url: null,
        canonical_url: null,
        landing_page_url: null,
        brand_id: null,
        created_at: "2026-08-08T00:00:00Z",
        updated_at: "2026-08-08T00:00:00Z",
    };
}

const categories: Category[] = [0, 1, 2].map(category);

/** Every page a template actually seeds, as [templateId, pageId] pairs. */
const TEMPLATE_PAGES: Array<[string, PageId]> = STORE_TEMPLATES.flatMap((t) =>
    (Object.keys(t.pages) as PageId[])
        .filter((pageId) => (t.pages[pageId] ?? []).length > 0)
        .map((pageId) => [t.id, pageId] as [string, PageId]),
);

function ctxFor(pageId: PageId): SectionRenderContext {
    return {
        tenant,
        runtime: { ...runtime, page_id: pageId },
        // PDP sections read ctx.product; category and search read the
        // collections. Supplying all of them keeps one ctx valid for every
        // page.
        product: products[0],
        category: categories[0],
        products,
        categories,
    };
}

function renderSection(def: AnySectionDefinition, props: unknown, pageId: PageId): string {
    const Render = def.render;
    return renderToStaticMarkup(
        <StoreBaseProvider base="">
            <Render props={props} ctx={ctxFor(pageId)} />
        </StoreBaseProvider>,
    );
}

/**
 * Render one template's stack for one page to a single markup string,
 * through the same resolve + schema-parse step the storefront's
 * RenderSection runs, so the guard sees the props a shopper's page is
 * drawn with. An instance its schema rejects renders nothing there, and
 * renders nothing here: the neutral signature pack seeds
 * testimonial_cards with no testimonials on purpose (no invented
 * reviews), so that section stays dark until the merchant adds real ones.
 * The defaults suite below still holds every section's markup to the
 * same rules.
 */
function renderPage(templateId: string, pageId: PageId): string {
    const tpl = STORE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new Error(`unknown template ${templateId}`);
    const pageRuntime = { ...runtime, page_id: pageId };
    return (tpl.pages[pageId] ?? [])
        .map((section) => {
            const def = getSection(section.type);
            if (!def) throw new Error(`${templateId}: unknown section ${section.type}`);
            const parsed = def.schema.safeParse(
                resolveSection<Record<string, unknown>>(section, pageRuntime),
            );
            return parsed.success ? renderSection(def, parsed.data, pageId) : "";
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

const BANNED_PALETTE = [
    /\bbg-white\b/,
    /\bcandy-(ink|cream|pink|mint|butter|lilac|sky)\b/,
    /\bshadow-bento(-sm|-lg)?\b/,
];

function bannedPaletteHits(html: string): string[] {
    return BANNED_PALETTE.flatMap((re) => html.match(re)?.[0] ?? []);
}

function unpairedFills(html: string): string[] {
    const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
    return classAttrs.filter((cls) =>
        FILL_PAIRS.some(({ bg, needs }) => bg.test(cls) && !needs.some((n) => cls.includes(n))),
    );
}

describe.each(TEMPLATE_PAGES)("%s / %s", (id, pageId) => {
    it("renders every section in the stack", () => {
        const html = renderPage(id, pageId);
        expect(html.length).toBeGreaterThan(0);
    });

    it("carries no hardcoded Candy Bento palette", () => {
        expect(bannedPaletteHits(renderPage(id, pageId)), `${id}/${pageId}`).toEqual([]);
    });

    it("pairs every filled background with its on-color", () => {
        expect(
            unpairedFills(renderPage(id, pageId)),
            `${id}/${pageId} has filled surfaces with no foreground`,
        ).toEqual([]);
    });
});

// A merchant adds sections the templates never seed, and every new section
// starts from its defaultProps, so each built-in is held to the same two
// rules on its defaults, rendered on a page it is valid on.
// The registry the storefront renders from; importing the barrel fills it.
const REGISTERED = listSections();

it("the registry holds every built-in section", () => {
    expect(REGISTERED.map((d) => d.type).sort()).toEqual(
        BUILTIN_SECTIONS.map((d) => d.type).sort(),
    );
});

describe.each(REGISTERED.map((d) => [d.type, d] as const))(
    "section defaults: %s",
    (_type, def) => {
        const pageId: PageId = def.valid_on[0] ?? "home";
        const html = (): string => renderSection(def, def.defaultProps, pageId);

        it("carries no hardcoded Candy Bento palette", () => {
            expect(bannedPaletteHits(html())).toEqual([]);
        });

        it("pairs every filled background with its on-color", () => {
            expect(unpairedFills(html())).toEqual([]);
        });
    },
);
