/**
 * Every class the section library emits resolves to a real rule (W7.10).
 *
 * The plan called this "Storybook × variant visual regression". A screenshot
 * pipeline is the wrong instrument for this storefront and would not have
 * caught any of the three silent visual failures this program has hit. The
 * template's whole identity flows through CSS custom properties, so a pixel
 * diff across brand-kit directions would mostly be re-testing the browser,
 * while the actual bugs were classes in the shipped HTML that matched **no
 * rule at all**:
 *
 *   * 45 brand-kit opacity utilities (`text-bk-ink/60`, `bg-bk-ink/20`,
 *     `border-bk-ink/10`) compiled to nothing, because Tailwind cannot break
 *     a `var()` colour into channels. No warning, no error — muted text
 *     rendered at full ink and tinted panels had no tint.
 *   * A typo'd or renamed token fails exactly the same way, silently.
 *
 * So this renders every registered section, collects every class it actually
 * puts in the HTML, compiles the real stylesheet, and asserts the two sets
 * line up. It is the regression net that fits how this system works, and it
 * would have caught all 45 on the day they were written.
 */

import { describe, it, expect, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { listSections } from "@scheniders/sections";
import { StoreBaseProvider } from "@scheniders/sections/helpers/store-context";
import type { SectionRenderContext } from "@scheniders/sections/_types";

const ROOT = path.resolve(__dirname, "..");

/**
 * Classes Tailwind deliberately emits no rule for. `group` and `peer` are
 * markers that only ever appear in another rule's selector, so their absence
 * from the stylesheet is correct, not a failure.
 */
const NO_RULE_BY_DESIGN = /^(group|peer)(\/[\w-]+)?$/;

const cssClasses = new Set<string>();

beforeAll(() => {
    // The real stylesheet, compiled from the real config against the real
    // sources — not a fixture, so a config change is covered too.
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bk-css-")), "out.css");
    execFileSync(
        "node",
        [
            // Resolve through Node rather than guessing a path: pnpm keeps the
            // real package under a content-addressed directory, not in a
            // predictable `node_modules/tailwindcss`.
            createRequire(path.join(ROOT, "package.json")).resolve(
                "tailwindcss/lib/cli.js",
            ),
            "-c", path.join(ROOT, "tailwind.config.ts"),
            "-i", path.join(ROOT, "app/globals.css"),
            "-o", out,
        ],
        { cwd: ROOT, stdio: "pipe" },
    );
    const css = fs.readFileSync(out, "utf8");

    // A class selector is a dot followed by name characters, where a character
    // may be escaped two different ways. Most are a plain backslash pair
    // (`.hover\:scale-105`, `.aspect-\[9\/16\]`). A few are a CSS hex escape
    // with a trailing space — a comma is written `\2c `, so
    // `transition-[color,opacity]` becomes `.transition-\[color\2c opacity\]`.
    // Reading the hex form as a backslash pair truncates the selector at the
    // space and reports a live class as missing.
    for (const m of css.matchAll(
        /\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[A-Za-z0-9_-])+)/g,
    )) {
        cssClasses.add(
            m[1].replace(/\\([0-9a-fA-F]{1,6}) ?|\\(.)/g, (_all, hex, ch) =>
                hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : ch,
            ),
        );
    }
}, 120_000);

const LOCALES = ["ar", "en", "ku"] as const;

function ctxFor(page: string, locale: string): SectionRenderContext {
    return {
        tenant: { id: "t", business_name: "متجر", store_config: {} },
        runtime: {
            page_id: page,
            breakpoint: "mobile",
            locale,
            audience_segments: [],
            ab_test_arms: {},
            now: new Date("2026-09-11T00:00:00Z"),
        },
        products: [],
        categories: [],
    } as unknown as SectionRenderContext;
}

/** Every class the section puts in the HTML, across the pages it is valid on. */
function emittedClasses(section: ReturnType<typeof listSections>[number]): Set<string> {
    const found = new Set<string>();
    const pages = section.valid_on?.length ? section.valid_on : ["home"];
    for (const page of pages) {
        for (const locale of LOCALES) {
            const html = renderToStaticMarkup(
                React.createElement(
                    StoreBaseProvider,
                    { base: "" } as never,
                    React.createElement(section.render as never, {
                        props: section.defaultProps,
                        ctx: ctxFor(page, locale),
                    } as never),
                ),
            );
            for (const m of html.matchAll(/class="([^"]*)"/g)) {
                // React escapes `&` in attributes, so an arbitrary variant like
                // `[&::-webkit-scrollbar]:hidden` arrives as `&amp;`. The class
                // the browser sees is the unescaped one.
                const attr = m[1]
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&#x27;/g, "'");
                for (const c of attr.split(/\s+/)) if (c) found.add(c);
            }
        }
    }
    return found;
}

const sections = listSections();

describe("the section library", () => {
    it("has every section registered", () => {
        expect(sections.length).toBeGreaterThanOrEqual(64);
    });

    it("renders every section on every page it claims, in every locale", () => {
        // A section that throws at render is dropped from the page with no
        // trace; this is the cheapest possible guard against that.
        const broken: string[] = [];
        for (const s of sections) {
            try {
                emittedClasses(s);
            } catch (e) {
                broken.push(`${s.type}: ${(e as Error).message}`);
            }
        }
        expect(broken).toEqual([]);
    });
});

describe("every emitted class resolves to a rule", () => {
    it.each(sections.map((s) => s.type))("%s", (type) => {
        const section = sections.find((s) => s.type === type)!;
        const missing = [...emittedClasses(section)]
            .filter((c) => !NO_RULE_BY_DESIGN.test(c))
            .filter((c) => !cssClasses.has(c))
            .sort();
        // A class here is in the shipped HTML and matches nothing in the
        // stylesheet — it does exactly nothing, silently.
        expect(missing).toEqual([]);
    });
});
