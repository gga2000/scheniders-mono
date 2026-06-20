// =====================================================================
// Tests for store-config-v2 variant resolver.
// =====================================================================
// Covers:
//   1. matchCondition — all 9 VariantCondition.kind values
//   2. deepMerge semantics
//   3. Variant priority + stacking
//   4. Page-level resolution
//   5. evaluateSegments — all 8 SegmentRule.kind values
//   6. assignAbArm — determinism + distribution (property-based)
//   7. Fixture-driven golden tests
//   8. fast-check round-trip properties
// =====================================================================

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  assignAbArm,
  deepMerge,
  evaluateSegments,
  isSectionEnabled,
  matchesVisibility,
  resolveGlobals,
  resolvePage,
  resolveSection,
  type SegmentEvalContext,
} from "./store-config-v2-resolver";
import type {
  AudienceSegment,
  Experiment,
  PageId,
  RuntimeContext,
  SectionInstance,
  StoreConfigV2,
  Variant,
  VariantCondition,
  VisibilityRule,
} from "./store-config-v2";

import { multilingualHomeFixture } from "./__fixtures__/multilingual-home.fixture";
import { scheduledBannerFixture } from "./__fixtures__/scheduled-banner.fixture";
import { abTestHeroFixture } from "./__fixtures__/ab-test-hero.fixture";

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function makeCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    page_id: "home",
    breakpoint: "desktop",
    locale: "en",
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-05-15T00:00:00Z"),
    ...overrides,
  };
}

function makeInstance(
  base: Record<string, unknown>,
  variants?: Variant[],
  enabled = true,
): SectionInstance {
  return {
    id: "test-section",
    type: "test",
    enabled,
    base,
    variants,
  };
}

function variant(
  id: string,
  conditions: VariantCondition[],
  override: Record<string, unknown>,
  priority = 10,
  enabled: boolean | undefined = undefined,
): Variant {
  const v: Variant = {
    id,
    label: id,
    conditions,
    override,
    priority,
  };
  if (enabled !== undefined) v.enabled = enabled;
  return v;
}

/* ─────────────────────────────────────────────────────────────────── */
/* 1. matchCondition — one match / one non-match / one edge per kind    */
/* ─────────────────────────────────────────────────────────────────── */

describe("matchCondition (via resolveSection)", () => {
  type Case = {
    kind: string;
    cond: VariantCondition;
    ctxMatch: Partial<RuntimeContext>;
    ctxNoMatch: Partial<RuntimeContext>;
    ctxEdge: Partial<RuntimeContext>;
    edgeMatches: boolean;
  };

  const cases: Case[] = [
    {
      kind: "locale",
      cond: { kind: "locale", values: ["ar", "ku"] },
      ctxMatch: { locale: "ar" },
      ctxNoMatch: { locale: "en" },
      // Edge: empty values list — nothing can match.
      ctxEdge: { locale: "ar" },
      edgeMatches: true,
    },
    {
      kind: "breakpoint",
      cond: { kind: "breakpoint", values: ["mobile"] },
      ctxMatch: { breakpoint: "mobile" },
      ctxNoMatch: { breakpoint: "desktop" },
      ctxEdge: { breakpoint: "mobile" },
      edgeMatches: true,
    },
    {
      kind: "page",
      cond: { kind: "page", values: ["product"] },
      ctxMatch: { page_id: "product" as PageId },
      ctxNoMatch: { page_id: "home" as PageId },
      ctxEdge: { page_id: "product" as PageId },
      edgeMatches: true,
    },
    {
      kind: "governorate",
      cond: { kind: "governorate", values: ["BG"] },
      ctxMatch: { governorate: "BG" },
      ctxNoMatch: { governorate: "BA" },
      // Edge: missing governorate in ctx → must not match.
      ctxEdge: {},
      edgeMatches: false,
    },
    {
      kind: "product",
      cond: { kind: "product", product_ids: ["p-1", "p-2"] },
      ctxMatch: { product_id: "p-1" },
      ctxNoMatch: { product_id: "p-3" },
      // Edge: missing product_id in ctx → must not match.
      ctxEdge: {},
      edgeMatches: false,
    },
    {
      kind: "category",
      cond: { kind: "category", category_ids: ["c-1"] },
      ctxMatch: { category_id: "c-1" },
      ctxNoMatch: { category_id: "c-2" },
      ctxEdge: {},
      edgeMatches: false,
    },
    {
      kind: "audience",
      cond: { kind: "audience", segment_id: "vip" },
      ctxMatch: { audience_segments: ["vip", "early-adopter"] },
      ctxNoMatch: { audience_segments: ["regular"] },
      // Edge: empty segments array.
      ctxEdge: { audience_segments: [] },
      edgeMatches: false,
    },
    {
      kind: "ab_test",
      cond: { kind: "ab_test", experiment_id: "exp", arm: "a" },
      ctxMatch: { ab_test_arms: { exp: "a" } },
      ctxNoMatch: { ab_test_arms: { exp: "b" } },
      // Edge: experiment not present at all → no match.
      ctxEdge: { ab_test_arms: {} },
      edgeMatches: false,
    },
    {
      kind: "time_window",
      cond: {
        kind: "time_window",
        start_iso: "2026-11-28T00:00:00Z",
        end_iso: "2026-12-01T00:00:00Z",
      },
      ctxMatch: { now: new Date("2026-11-29T12:00:00Z") },
      ctxNoMatch: { now: new Date("2026-01-01T00:00:00Z") },
      // Edge: exactly at start_iso boundary → matches (start is inclusive).
      ctxEdge: { now: new Date("2026-11-28T00:00:00Z") },
      edgeMatches: true,
    },
  ];

  it.each(cases)("$kind: matches the matching context", (c) => {
    const inst = makeInstance(
      { tag: "base" },
      [variant("v", [c.cond], { tag: "variant" })],
    );
    const props = resolveSection<{ tag: string }>(inst, makeCtx(c.ctxMatch));
    expect(props.tag).toBe("variant");
  });

  it.each(cases)("$kind: does NOT match the non-matching context", (c) => {
    const inst = makeInstance(
      { tag: "base" },
      [variant("v", [c.cond], { tag: "variant" })],
    );
    const props = resolveSection<{ tag: string }>(inst, makeCtx(c.ctxNoMatch));
    expect(props.tag).toBe("base");
  });

  it.each(cases)("$kind: edge-case context behaves as expected", (c) => {
    const inst = makeInstance(
      { tag: "base" },
      [variant("v", [c.cond], { tag: "variant" })],
    );
    const props = resolveSection<{ tag: string }>(inst, makeCtx(c.ctxEdge));
    expect(props.tag).toBe(c.edgeMatches ? "variant" : "base");
  });

  it("time_window: invalid start_iso never matches", () => {
    const inst = makeInstance({ tag: "base" }, [
      variant(
        "v",
        [{ kind: "time_window", start_iso: "not-a-date" }],
        { tag: "variant" },
      ),
    ]);
    expect(resolveSection<{ tag: string }>(inst, makeCtx()).tag).toBe("base");
  });

  it("time_window: open-ended (no end_iso) keeps matching forever after start", () => {
    const inst = makeInstance({ tag: "base" }, [
      variant(
        "v",
        [{ kind: "time_window", start_iso: "2020-01-01T00:00:00Z" }],
        { tag: "variant" },
      ),
    ]);
    expect(
      resolveSection<{ tag: string }>(
        inst,
        makeCtx({ now: new Date("2099-12-31T23:59:59Z") }),
      ).tag,
    ).toBe("variant");
  });

  it("time_window: a MALFORMED end_iso must not stay active forever (EC21)", () => {
    const inst = makeInstance({ tag: "base" }, [
      variant(
        "v",
        [
          {
            kind: "time_window",
            start_iso: "2020-01-01T00:00:00Z",
            end_iso: "broken",
          },
        ],
        { tag: "variant" },
      ),
    ]);
    // Past the start, but the broken end means the window is misconfigured →
    // it does NOT apply (old behaviour: stuck active forever).
    expect(
      resolveSection<{ tag: string }>(
        inst,
        makeCtx({ now: new Date("2099-12-31T23:59:59Z") }),
      ).tag,
    ).toBe("base");
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 2. Deep-merge tests                                                  */
/* ─────────────────────────────────────────────────────────────────── */

describe("deepMerge", () => {
  it("base + empty override returns base unchanged (shallow-cloned but deep-equal)", () => {
    const base = { a: 1, b: { c: 2 } };
    const result = deepMerge(base, {});
    expect(result).toEqual(base);
    // Top-level is a new object (spread), but nested objects are reused
    // when the override has no matching nested key.
    expect(result).not.toBe(base);
    expect(result.b).toBe(base.b);
  });

  it("undefined fields in override do NOT overwrite base values", () => {
    const base = { a: 1, b: "kept" };
    const override = { a: 99, b: undefined } as Partial<typeof base>;
    expect(deepMerge(base, override)).toEqual({ a: 99, b: "kept" });
  });

  it("merges 3 levels deep", () => {
    const base: Record<string, unknown> = {
      l1: { l2: { l3a: "keep", l3b: "base" } },
    };
    const override: Record<string, unknown> = {
      l1: { l2: { l3b: "override", l3c: "new" } },
    };
    expect(deepMerge(base, override)).toEqual({
      l1: { l2: { l3a: "keep", l3b: "override", l3c: "new" } },
    });
  });

  it("arrays in override fully REPLACE base arrays (no concat / merge)", () => {
    const base = { items: [1, 2, 3], meta: { tags: ["a", "b"] } };
    const override = { items: [9], meta: { tags: ["c"] } };
    expect(deepMerge(base, override)).toEqual({
      items: [9],
      meta: { tags: ["c"] },
    });
  });

  it("isPlainObject discriminator: non-plain values (Date, Map, class) REPLACE base", () => {
    class Box {
      v = 1;
    }
    const baseDate = new Date("2020-01-01");
    const overrideDate = new Date("2030-01-01");
    const base = {
      d: baseDate,
      m: new Map([["k", "v"]]),
      box: new Box(),
      arr: [1, 2],
    };
    const override = {
      d: overrideDate,
      m: new Map([["k2", "v2"]]),
      box: new Box(),
      arr: [9],
    };
    const out = deepMerge(base, override as Partial<typeof base>);
    expect(out.d).toBe(overrideDate);
    expect(out.m).toBe(override.m);
    expect(out.box).toBe(override.box);
    expect(out.arr).toEqual([9]);
  });

  it("override of plain object onto a non-plain base value: REPLACES (no recursion)", () => {
    const base = { x: new Date("2020-01-01") };
    const override = { x: { y: 1 } };
    const out = deepMerge(base, override as unknown as Partial<typeof base>);
    expect(out.x).toEqual({ y: 1 });
  });

  it("symbol keys in override are ignored (out of scope: Object.entries only walks string keys)", () => {
    const SYM = Symbol("hidden");
    const base = { visible: "base" };
    const override = { visible: "override", [SYM]: "ignored" } as Record<
      string | symbol,
      unknown
    >;
    const out = deepMerge(
      base,
      override as Partial<typeof base>,
    ) as Record<string | symbol, unknown>;
    expect(out.visible).toBe("override");
    // Documented behaviour: symbol keys are NOT carried through.
    expect(Object.getOwnPropertySymbols(out)).toHaveLength(0);
  });

  it("override that itself is not a plain object returns base untouched", () => {
    const base = { a: 1 };
    // Calling with a non-plain value — current impl bails early.
    expect(
      deepMerge(base, [] as unknown as Partial<typeof base>),
    ).toBe(base);
    expect(
      deepMerge(base, new Date() as unknown as Partial<typeof base>),
    ).toBe(base);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 3. Variant priority + stacking                                       */
/* ─────────────────────────────────────────────────────────────────── */

describe("variant priority + stacking", () => {
  it("higher priority wins when both variants match the same field", () => {
    const inst = makeInstance({ x: "base" }, [
      variant("low", [], { x: "low" }, 1),
      variant("high", [], { x: "high" }, 99),
    ]);
    expect(resolveSection<{ x: string }>(inst, makeCtx()).x).toBe("high");
  });

  it("three variants (priority 1, 5, 10) deep-merge in ascending order; 10 wins ties", () => {
    const inst = makeInstance({ a: "base", b: "base", c: "base" }, [
      variant("p10", [], { a: "p10" }, 10),
      variant("p1", [], { a: "p1", b: "p1" }, 1),
      variant("p5", [], { b: "p5", c: "p5" }, 5),
    ]);
    const out = resolveSection<{ a: string; b: string; c: string }>(
      inst,
      makeCtx(),
    );
    expect(out).toEqual({ a: "p10", b: "p5", c: "p5" });
  });

  it("variant with enabled:false is skipped even when conditions match", () => {
    const inst = makeInstance({ x: "base" }, [
      variant("disabled", [], { x: "should-not-apply" }, 100, false),
    ]);
    expect(resolveSection<{ x: string }>(inst, makeCtx()).x).toBe("base");
  });

  it("empty conditions: [] acts as a base override (always matches)", () => {
    const inst = makeInstance({ x: "base" }, [
      variant("always", [], { x: "always" }, 1),
    ]);
    expect(resolveSection<{ x: string }>(inst, makeCtx()).x).toBe("always");
  });

  it("section with no variants returns base verbatim (shallow-equal-content)", () => {
    const inst = makeInstance({ x: "base" });
    expect(resolveSection<{ x: string }>(inst, makeCtx())).toEqual({
      x: "base",
    });
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 4. Page-level resolution                                             */
/* ─────────────────────────────────────────────────────────────────── */

describe("resolvePage", () => {
  function makeConfig(pages: StoreConfigV2["pages"]): StoreConfigV2 {
    return {
      schema_version: 2,
      brand_kit: {
        identity: {},
        colors: {
          primary: "#000",
          secondary: "#000",
          accent: "#000",
          surface: "#fff",
          surface_alt: "#fff",
          ink: "#000",
          success: "#0f0",
          danger: "#f00",
        },
        typography: { display: "X", body: "Y", scale: "comfortable" },
        shape: {
          radius: "soft",
          border_thickness: "thin",
          shadow_style: "soft",
          rotation_intensity: "none",
        },
        motion: { enabled: false, speed: "normal" },
        voice: { formality: "casual" },
      },
      pages,
      globals: {},
      experiments: [],
      segments: [],
      schedules: [],
      default_locale: "en",
      enabled_locales: ["en"],
    };
  }

  it("filters out sections with enabled:false at the instance level", () => {
    const config = makeConfig([
      {
        page_id: "home",
        sections: [
          { id: "a", type: "x", enabled: true, base: { v: 1 } },
          { id: "b", type: "x", enabled: false, base: { v: 2 } },
        ],
      },
    ]);
    const out = resolvePage(config, makeCtx({ page_id: "home" }));
    expect(out).toHaveLength(1);
    expect(out[0].instance.id).toBe("a");
  });

  it("respects variant-disabled sections (override sets enabled:false in matched ctx)", () => {
    const config = makeConfig([
      {
        page_id: "home",
        sections: [
          {
            id: "a",
            type: "x",
            enabled: true,
            base: { v: 1, enabled: true },
            variants: [
              variant(
                "hide-on-mobile",
                [{ kind: "breakpoint", values: ["mobile"] }],
                { enabled: false },
              ),
            ],
          },
        ],
      },
    ]);
    const desktop = resolvePage(
      config,
      makeCtx({ page_id: "home", breakpoint: "desktop" }),
    );
    const mobile = resolvePage(
      config,
      makeCtx({ page_id: "home", breakpoint: "mobile" }),
    );
    expect(desktop).toHaveLength(1);
    expect(mobile).toHaveLength(0);
  });

  it("returns [] when page_id is not in config.pages", () => {
    const config = makeConfig([
      { page_id: "home", sections: [] },
    ]);
    expect(
      resolvePage(config, makeCtx({ page_id: "product" })),
    ).toEqual([]);
  });

  it("isSectionEnabled also short-circuits when instance.enabled is false", () => {
    const inst = makeInstance({ v: 1 }, [], false);
    expect(isSectionEnabled(inst, makeCtx())).toBe(false);
  });

  it("resolveGlobals filters disabled slots and applies variants", () => {
    const out = resolveGlobals(
      {
        header: { id: "h", type: "header", enabled: true, base: { v: 1 } },
        footer: {
          id: "f",
          type: "footer",
          enabled: true,
          base: { v: 2, enabled: true },
          variants: [
            variant(
              "hide",
              [{ kind: "locale", values: ["en"] }],
              { enabled: false },
            ),
          ],
        },
        promo_bar: { id: "p", type: "promo", enabled: false, base: { v: 3 } },
      },
      makeCtx(),
    );
    expect(out.header).toEqual({ v: 1 });
    expect(out.footer).toBeUndefined();
    expect(out.promo_bar).toBeUndefined();
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 5. evaluateSegments                                                  */
/* ─────────────────────────────────────────────────────────────────── */

describe("evaluateSegments", () => {
  function segCtx(o: Partial<SegmentEvalContext> = {}): SegmentEvalContext {
    return {
      minutes_since_first_visit: 0,
      is_returning: false,
      has_ordered_before: false,
      cart_total_iqd: 0,
      minutes_since_cart_activity: Infinity,
      breakpoint: "desktop",
      ...o,
    };
  }

  function seg(
    id: string,
    rules: AudienceSegment["rules"],
    combine: AudienceSegment["combine"] = "all",
  ): AudienceSegment {
    return { id, name: id, rules, combine };
  }

  // Run match / non-match / edge for each rule.kind.
  const ruleCases: Array<{
    kind: string;
    rule: AudienceSegment["rules"][number];
    ctxMatch: Partial<SegmentEvalContext>;
    ctxNoMatch: Partial<SegmentEvalContext>;
    ctxEdge: Partial<SegmentEvalContext>;
    edgeMatches: boolean;
  }> = [
    {
      kind: "first_visit (within_minutes)",
      rule: { kind: "first_visit", within_minutes: 5 },
      ctxMatch: { minutes_since_first_visit: 3 },
      ctxNoMatch: { minutes_since_first_visit: 6 },
      // Edge: exactly at boundary → still matches (≤).
      ctxEdge: { minutes_since_first_visit: 5 },
      edgeMatches: true,
    },
    {
      kind: "first_visit (no within_minutes → not returning)",
      rule: { kind: "first_visit" },
      ctxMatch: { is_returning: false },
      ctxNoMatch: { is_returning: true },
      ctxEdge: { is_returning: false },
      edgeMatches: true,
    },
    {
      kind: "returning_visitor",
      rule: { kind: "returning_visitor" },
      ctxMatch: { is_returning: true },
      ctxNoMatch: { is_returning: false },
      ctxEdge: { is_returning: true },
      edgeMatches: true,
    },
    {
      kind: "has_ordered_before",
      rule: { kind: "has_ordered_before" },
      ctxMatch: { has_ordered_before: true },
      ctxNoMatch: { has_ordered_before: false },
      ctxEdge: { has_ordered_before: false },
      edgeMatches: false,
    },
    {
      kind: "cart_total >=",
      rule: { kind: "cart_total", op: ">=", value_iqd: 50_000 },
      ctxMatch: { cart_total_iqd: 60_000 },
      ctxNoMatch: { cart_total_iqd: 10_000 },
      // Edge: exactly the threshold.
      ctxEdge: { cart_total_iqd: 50_000 },
      edgeMatches: true,
    },
    {
      kind: "abandoned_cart",
      rule: { kind: "abandoned_cart", minutes_since: 30 },
      ctxMatch: { minutes_since_cart_activity: 60, cart_total_iqd: 1000 },
      // No cart total → not abandoned.
      ctxNoMatch: { minutes_since_cart_activity: 60, cart_total_iqd: 0 },
      // Exactly at boundary with positive cart.
      ctxEdge: { minutes_since_cart_activity: 30, cart_total_iqd: 100 },
      edgeMatches: true,
    },
    {
      kind: "governorate",
      rule: { kind: "governorate", values: ["BG"] },
      ctxMatch: { governorate: "BG" },
      ctxNoMatch: { governorate: "BA" },
      // Edge: no governorate set → never matches.
      ctxEdge: {},
      edgeMatches: false,
    },
    {
      kind: "traffic_source",
      rule: { kind: "traffic_source", values: ["meta", "tiktok"] },
      ctxMatch: { traffic_source: "meta" },
      ctxNoMatch: { traffic_source: "google" },
      // Edge: no traffic source set → no match.
      ctxEdge: {},
      edgeMatches: false,
    },
    {
      kind: "device",
      rule: { kind: "device", values: ["mobile"] },
      ctxMatch: { breakpoint: "mobile" },
      ctxNoMatch: { breakpoint: "desktop" },
      ctxEdge: { breakpoint: "mobile" },
      edgeMatches: true,
    },
  ];

  it.each(ruleCases)("$kind: match context yields the segment id", (c) => {
    const out = evaluateSegments([seg("s", [c.rule])], segCtx(c.ctxMatch));
    expect(out).toEqual(["s"]);
  });

  it.each(ruleCases)("$kind: non-match context returns []", (c) => {
    const out = evaluateSegments([seg("s", [c.rule])], segCtx(c.ctxNoMatch));
    expect(out).toEqual([]);
  });

  it.each(ruleCases)("$kind: edge-case behaves as expected", (c) => {
    const out = evaluateSegments([seg("s", [c.rule])], segCtx(c.ctxEdge));
    expect(out).toEqual(c.edgeMatches ? ["s"] : []);
  });

  it("combine:'all' requires every rule to match", () => {
    const s = seg(
      "all-seg",
      [
        { kind: "returning_visitor" },
        { kind: "cart_total", op: ">=", value_iqd: 100 },
      ],
      "all",
    );
    expect(
      evaluateSegments(
        [s],
        segCtx({ is_returning: true, cart_total_iqd: 50 }),
      ),
    ).toEqual([]);
    expect(
      evaluateSegments(
        [s],
        segCtx({ is_returning: true, cart_total_iqd: 200 }),
      ),
    ).toEqual(["all-seg"]);
  });

  it("combine:'any' matches if at least one rule matches", () => {
    const s = seg(
      "any-seg",
      [
        { kind: "returning_visitor" },
        { kind: "has_ordered_before" },
      ],
      "any",
    );
    expect(
      evaluateSegments(
        [s],
        segCtx({ is_returning: false, has_ordered_before: false }),
      ),
    ).toEqual([]);
    expect(
      evaluateSegments(
        [s],
        segCtx({ is_returning: true, has_ordered_before: false }),
      ),
    ).toEqual(["any-seg"]);
  });

  it("returns segment IDs (strings), not segment objects", () => {
    const out = evaluateSegments(
      [seg("s1", [{ kind: "returning_visitor" }])],
      segCtx({ is_returning: true }),
    );
    expect(typeof out[0]).toBe("string");
    expect(out[0]).toBe("s1");
  });

  it("returns all matched segment ids when multiple match", () => {
    const s1 = seg("vip", [{ kind: "has_ordered_before" }]);
    const s2 = seg("returning", [{ kind: "returning_visitor" }]);
    const s3 = seg("desktop", [{ kind: "device", values: ["desktop"] }]);
    const out = evaluateSegments(
      [s1, s2, s3],
      segCtx({
        has_ordered_before: true,
        is_returning: true,
        breakpoint: "desktop",
      }),
    );
    expect(out).toEqual(["vip", "returning", "desktop"]);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 6. assignAbArm — determinism + distribution                          */
/* ─────────────────────────────────────────────────────────────────── */

describe("assignAbArm", () => {
  function exp(
    arms: Array<{ id: string; pct: number }>,
    status: Experiment["status"] = "running",
  ): Experiment {
    return {
      id: "exp_test",
      name: "test",
      status,
      primary_metric: "orders",
      arms: arms.map((a) => ({ id: a.id, label: a.id, traffic_pct: a.pct })),
    };
  }

  // Seeded RNG so distribution tests are deterministic.
  function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 0x343fd) + 0x269ec3) >>> 0;
      return s / 0x100000000;
    };
  }

  function makeVisitorKey(rng: () => number): string {
    // 16 random hex-like chars, deterministic from seed.
    let k = "";
    for (let i = 0; i < 16; i++) {
      k += Math.floor(rng() * 36).toString(36);
    }
    return k;
  }

  it("same (experiment_id, visitor_key) → always returns the same arm (deterministic)", () => {
    const e = exp([
      { id: "a", pct: 50 },
      { id: "b", pct: 50 },
    ]);
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 64 }), (key) => {
        const first = assignAbArm(e, key);
        for (let i = 0; i < 10; i++) {
          expect(assignAbArm(e, key)).toBe(first);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("50/50 split: 10k keys → each arm within ±3% of 50%", () => {
    const e = exp([
      { id: "a", pct: 50 },
      { id: "b", pct: 50 },
    ]);
    const rng = makeRng(0xc0ffee);
    const counts: Record<string, number> = { a: 0, b: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const arm = assignAbArm(e, makeVisitorKey(rng));
      if (arm) counts[arm] += 1;
    }
    expect(counts.a + counts.b).toBe(N);
    expect(Math.abs(counts.a / N - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(counts.b / N - 0.5)).toBeLessThan(0.03);
  });

  it("70/20/10 split: 10k keys → each arm within ±3% of expected", () => {
    const e = exp([
      { id: "a", pct: 70 },
      { id: "b", pct: 20 },
      { id: "c", pct: 10 },
    ]);
    const rng = makeRng(0xbadcafe);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const arm = assignAbArm(e, makeVisitorKey(rng));
      if (arm) counts[arm] += 1;
    }
    expect(counts.a + counts.b + counts.c).toBe(N);
    expect(Math.abs(counts.a / N - 0.7)).toBeLessThan(0.03);
    expect(Math.abs(counts.b / N - 0.2)).toBeLessThan(0.03);
    expect(Math.abs(counts.c / N - 0.1)).toBeLessThan(0.03);
  });

  it("status='draft' → returns null", () => {
    expect(assignAbArm(exp([{ id: "a", pct: 100 }], "draft"), "k")).toBeNull();
  });

  it("status='paused' → returns null", () => {
    expect(
      assignAbArm(exp([{ id: "a", pct: 100 }], "paused"), "k"),
    ).toBeNull();
  });

  it("status='completed' → returns null", () => {
    expect(
      assignAbArm(exp([{ id: "a", pct: 100 }], "completed"), "k"),
    ).toBeNull();
  });

  it("empty arms → returns null", () => {
    expect(assignAbArm(exp([], "running"), "k")).toBeNull();
  });

  it("all-zero traffic_pct → returns null", () => {
    expect(
      assignAbArm(
        exp([
          { id: "a", pct: 0 },
          { id: "b", pct: 0 },
        ]),
        "k",
      ),
    ).toBeNull();
  });

  it("arms that don't sum to 100 still distribute proportionally (resolver-side guard)", () => {
    // 30/30/30 = 90 total. The resolver buckets by `totalPct`, not by 100,
    // so each arm should still get ≈1/3 of traffic.
    const e = exp([
      { id: "a", pct: 30 },
      { id: "b", pct: 30 },
      { id: "c", pct: 30 },
    ]);
    const rng = makeRng(0xbeef00);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const arm = assignAbArm(e, makeVisitorKey(rng));
      if (arm) counts[arm] += 1;
    }
    expect(counts.a + counts.b + counts.c).toBe(N);
    // Each arm should get ≈1/3 ± 3%.
    expect(Math.abs(counts.a / N - 1 / 3)).toBeLessThan(0.03);
    expect(Math.abs(counts.b / N - 1 / 3)).toBeLessThan(0.03);
    expect(Math.abs(counts.c / N - 1 / 3)).toBeLessThan(0.03);
  });

  it("uneven arms that don't sum to 100 distribute by proportion (10/40)", () => {
    // 10 + 40 = 50; arm 'a' should get 10/50 = 20%, 'b' should get 80%.
    const e = exp([
      { id: "a", pct: 10 },
      { id: "b", pct: 40 },
    ]);
    const rng = makeRng(0xfadeface);
    const counts: Record<string, number> = { a: 0, b: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const arm = assignAbArm(e, makeVisitorKey(rng));
      if (arm) counts[arm] += 1;
    }
    expect(counts.a + counts.b).toBe(N);
    expect(Math.abs(counts.a / N - 0.2)).toBeLessThan(0.03);
    expect(Math.abs(counts.b / N - 0.8)).toBeLessThan(0.03);
  });

  it("different experiment_ids with same visitor key produce independent arms", () => {
    const e1: Experiment = {
      ...exp([
        { id: "a", pct: 50 },
        { id: "b", pct: 50 },
      ]),
      id: "exp_one",
    };
    const e2: Experiment = {
      ...exp([
        { id: "a", pct: 50 },
        { id: "b", pct: 50 },
      ]),
      id: "exp_two",
    };
    const rng = makeRng(42);
    let diffs = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const k = makeVisitorKey(rng);
      if (assignAbArm(e1, k) !== assignAbArm(e2, k)) diffs += 1;
    }
    // Independent hashes should disagree ~50% of the time.
    expect(diffs).toBeGreaterThan(N * 0.4);
    expect(diffs).toBeLessThan(N * 0.6);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 7. Fixture-driven golden tests                                       */
/* ─────────────────────────────────────────────────────────────────── */

describe("fixture: multilingual-home", () => {
  for (const c of multilingualHomeFixture.contexts) {
    it(c.label, () => {
      expect(resolveSection(multilingualHomeFixture.instance, c.ctx)).toEqual(
        c.expected_props,
      );
    });
  }
});

describe("fixture: scheduled-banner", () => {
  for (const c of scheduledBannerFixture.contexts) {
    it(c.label, () => {
      expect(resolveSection(scheduledBannerFixture.instance, c.ctx)).toEqual(
        c.expected_props,
      );
    });
  }
});

describe("fixture: ab-test-hero (with AND-stacked conditions)", () => {
  for (const c of abTestHeroFixture.contexts) {
    it(c.label, () => {
      expect(resolveSection(abTestHeroFixture.instance, c.ctx)).toEqual(
        c.expected_props,
      );
    });
  }
});

/* ─────────────────────────────────────────────────────────────────── */
/* 8. Property-based round-trip                                          */
/* ─────────────────────────────────────────────────────────────────── */

describe("property: resolveSection invariants", () => {
  // Arbitrary plain-object props.
  const propsArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 6 }),
    fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    { maxKeys: 6 },
  );

  const conditionArb: fc.Arbitrary<VariantCondition> = fc.oneof(
    fc.record({
      kind: fc.constant("locale" as const),
      values: fc.subarray(["ar", "en", "ku"] as const, {
        minLength: 1,
        maxLength: 3,
      }),
    }),
    fc.record({
      kind: fc.constant("breakpoint" as const),
      values: fc.subarray(["mobile", "tablet", "desktop"] as const, {
        minLength: 1,
        maxLength: 3,
      }),
    }),
  ) as fc.Arbitrary<VariantCondition>;

  const variantArb: fc.Arbitrary<Variant> = fc.record({
    id: fc.uuid(),
    label: fc.string({ maxLength: 8 }),
    conditions: fc.array(conditionArb, { maxLength: 3 }),
    override: propsArb,
    priority: fc.integer({ min: -100, max: 100 }),
  });

  const ctxArb: fc.Arbitrary<RuntimeContext> = fc.record({
    page_id: fc.constantFrom("home", "product", "category") as fc.Arbitrary<
      PageId
    >,
    breakpoint: fc.constantFrom("mobile", "tablet", "desktop"),
    locale: fc.constantFrom("ar", "en", "ku"),
    audience_segments: fc.array(fc.string(), { maxLength: 3 }),
    ab_test_arms: fc.dictionary(fc.string(), fc.string(), { maxKeys: 3 }),
    now: fc.constant(new Date("2026-05-15T00:00:00Z")),
  });

  it("never throws and always returns a plain object", () => {
    fc.assert(
      fc.property(
        propsArb,
        fc.array(variantArb, { maxLength: 5 }),
        ctxArb,
        (base, variants, ctx) => {
          const inst: SectionInstance = {
            id: "x",
            type: "x",
            enabled: true,
            base,
            variants,
          };
          const out = resolveSection(inst, ctx);
          expect(out).not.toBeNull();
          expect(typeof out).toBe("object");
          expect(Array.isArray(out)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("two calls with the same inputs return deep-equal results (referential distinctness at top level)", () => {
    fc.assert(
      fc.property(
        propsArb,
        fc.array(variantArb, { maxLength: 5 }),
        ctxArb,
        (base, variants, ctx) => {
          const inst: SectionInstance = {
            id: "x",
            type: "x",
            enabled: true,
            base,
            variants,
          };
          const a = resolveSection(inst, ctx);
          const b = resolveSection(inst, ctx);
          expect(a).toEqual(b);
          // When at least one variant applies AND has keys, deepMerge produces
          // a new top-level object — otherwise it can return the base verbatim
          // (when zero variants matched and no merge happened). So we only
          // assert deep-equal here; referential-distinctness is asserted in
          // a dedicated test below where we guarantee a variant applies.
        },
      ),
      { numRuns: 100 },
    );
  });

  it("guaranteed-matching variant always produces a new top-level object (no shared ref)", () => {
    fc.assert(
      fc.property(propsArb, propsArb, (base, override) => {
        const inst: SectionInstance = {
          id: "x",
          type: "x",
          enabled: true,
          base,
          variants: [variant("always", [], override, 1)],
        };
        const a = resolveSection(inst, makeCtx());
        const b = resolveSection(inst, makeCtx());
        expect(a).toEqual(b);
        expect(a).not.toBe(b);
      }),
      { numRuns: 50 },
    );
  });

  it("adding a variant with enabled:false never changes the output", () => {
    fc.assert(
      fc.property(
        propsArb,
        fc.array(variantArb, { maxLength: 4 }),
        propsArb,
        ctxArb,
        (base, variants, ghostOverride, ctx) => {
          const inst: SectionInstance = {
            id: "x",
            type: "x",
            enabled: true,
            base,
            variants,
          };
          const without = resolveSection(inst, ctx);
          const ghost: Variant = {
            id: "ghost",
            label: "ghost",
            conditions: [],
            override: ghostOverride,
            priority: 1000,
            enabled: false,
          };
          const instWithGhost: SectionInstance = {
            ...inst,
            variants: [...variants, ghost],
          };
          const withGhost = resolveSection(instWithGhost, ctx);
          expect(withGhost).toEqual(without);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* 9. Section-level visibility rules                                   */
/* ─────────────────────────────────────────────────────────────────── */

describe("section visibility", () => {
  it("matchesVisibility: undefined / empty rules always pass", () => {
    expect(matchesVisibility(undefined, makeCtx())).toBe(true);
    expect(matchesVisibility([], makeCtx())).toBe(true);
  });

  it("matchesVisibility: locale rule matches when locale is in values", () => {
    const rules: VisibilityRule[] = [{ kind: "locale", values: ["ar"] }];
    expect(matchesVisibility(rules, makeCtx({ locale: "ar" }))).toBe(true);
    expect(matchesVisibility(rules, makeCtx({ locale: "en" }))).toBe(false);
  });

  it("matchesVisibility: breakpoint rule honours runtime breakpoint", () => {
    const rules: VisibilityRule[] = [
      { kind: "breakpoint", values: ["mobile"] },
    ];
    expect(matchesVisibility(rules, makeCtx({ breakpoint: "mobile" }))).toBe(true);
    expect(matchesVisibility(rules, makeCtx({ breakpoint: "desktop" }))).toBe(false);
  });

  it("matchesVisibility: time_window rule respects start/end window", () => {
    const rules: VisibilityRule[] = [
      {
        kind: "time_window",
        start_iso: "2026-11-28T00:00:00Z",
        end_iso: "2026-12-01T00:00:00Z",
      },
    ];
    expect(
      matchesVisibility(rules, makeCtx({ now: new Date("2026-11-29T12:00:00Z") })),
    ).toBe(true);
    expect(
      matchesVisibility(rules, makeCtx({ now: new Date("2026-01-01T00:00:00Z") })),
    ).toBe(false);
  });

  it("matchesVisibility: audience rule matches when segment id is in ctx", () => {
    const rules: VisibilityRule[] = [{ kind: "audience", segment_id: "vip" }];
    expect(
      matchesVisibility(rules, makeCtx({ audience_segments: ["vip"] })),
    ).toBe(true);
    expect(
      matchesVisibility(rules, makeCtx({ audience_segments: ["regular"] })),
    ).toBe(false);
  });

  it("matchesVisibility: governorate rule matches geo-resolved governorate", () => {
    const rules: VisibilityRule[] = [{ kind: "governorate", values: ["BG"] }];
    expect(matchesVisibility(rules, makeCtx({ governorate: "BG" }))).toBe(true);
    expect(matchesVisibility(rules, makeCtx({ governorate: "BA" }))).toBe(false);
    expect(matchesVisibility(rules, makeCtx({}))).toBe(false);
  });

  it("matchesVisibility: page rule restricts to specific pages", () => {
    const rules: VisibilityRule[] = [{ kind: "page", values: ["product"] }];
    expect(matchesVisibility(rules, makeCtx({ page_id: "product" }))).toBe(true);
    expect(matchesVisibility(rules, makeCtx({ page_id: "home" }))).toBe(false);
  });

  it("matchesVisibility: ALL rules must match (AND semantics)", () => {
    const rules: VisibilityRule[] = [
      { kind: "locale", values: ["ar"] },
      { kind: "breakpoint", values: ["mobile"] },
    ];
    // Both match.
    expect(
      matchesVisibility(rules, makeCtx({ locale: "ar", breakpoint: "mobile" })),
    ).toBe(true);
    // Only one matches → fails AND.
    expect(
      matchesVisibility(rules, makeCtx({ locale: "ar", breakpoint: "desktop" })),
    ).toBe(false);
    expect(
      matchesVisibility(rules, makeCtx({ locale: "en", breakpoint: "mobile" })),
    ).toBe(false);
  });

  it("isSectionEnabled: visibility miss hides the section even if enabled=true", () => {
    const inst: SectionInstance = {
      id: "s",
      type: "x",
      enabled: true,
      base: {},
      visibility: [{ kind: "locale", values: ["ar"] }],
    };
    expect(isSectionEnabled(inst, makeCtx({ locale: "ar" }))).toBe(true);
    expect(isSectionEnabled(inst, makeCtx({ locale: "en" }))).toBe(false);
  });

  it("resolvePage: filters sections whose visibility rules don't match", () => {
    const config: StoreConfigV2 = {
      schema_version: 2,
      brand_kit: {
        identity: {},
        colors: {
          primary: "#000",
          secondary: "#000",
          accent: "#000",
          surface: "#fff",
          surface_alt: "#fff",
          ink: "#000",
          success: "#0f0",
          danger: "#f00",
        },
        typography: { display: "X", body: "Y", scale: "comfortable" },
        shape: {
          radius: "soft",
          border_thickness: "thin",
          shadow_style: "soft",
          rotation_intensity: "none",
        },
        motion: { enabled: false, speed: "normal" },
        voice: { formality: "casual" },
      },
      pages: [
        {
          page_id: "home",
          sections: [
            { id: "always", type: "x", enabled: true, base: { v: 1 } },
            {
              id: "ar-only",
              type: "x",
              enabled: true,
              base: { v: 2 },
              visibility: [{ kind: "locale", values: ["ar"] }],
            },
          ],
        },
      ],
      globals: {},
      experiments: [],
      segments: [],
      schedules: [],
      default_locale: "en",
      enabled_locales: ["en", "ar"],
    };
    const en = resolvePage(config, makeCtx({ page_id: "home", locale: "en" }));
    const ar = resolvePage(config, makeCtx({ page_id: "home", locale: "ar" }));
    expect(en.map((r) => r.instance.id)).toEqual(["always"]);
    expect(ar.map((r) => r.instance.id)).toEqual(["always", "ar-only"]);
  });
});
