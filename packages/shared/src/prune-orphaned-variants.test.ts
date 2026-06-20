import { describe, it, expect } from "vitest";
import type { PageConfig } from "./types/store-config-v2";
import {
  pruneVariantsForDeletedSegment,
  pruneVariantsForDeletedExperiment,
} from "./prune-orphaned-variants";

function section(id: string, variants: PageConfig["sections"][number]["variants"]) {
  return { id, type: "hero_image", enabled: true, base: {}, variants };
}

const pages: PageConfig[] = [
  {
    page_id: "home",
    sections: [
      section("s1", [
        {
          id: "v_seg",
          label: "VIP",
          conditions: [{ kind: "audience", segment_id: "seg_vip" }],
          override: { title: "VIP" },
          priority: 1,
        },
        {
          id: "v_keep",
          label: "Mobile",
          conditions: [{ kind: "breakpoint", values: ["mobile"] }],
          override: { title: "M" },
          priority: 1,
        },
      ]),
      section("s2", [
        {
          id: "v_exp",
          label: "Arm B",
          conditions: [{ kind: "ab_test", experiment_id: "exp_1", arm: "b" }],
          override: { title: "B" },
          priority: 1,
        },
        {
          // references BOTH the segment (AND'd) — dead once seg removed
          id: "v_mixed",
          label: "VIP + mobile",
          conditions: [
            { kind: "audience", segment_id: "seg_vip" },
            { kind: "breakpoint", values: ["mobile"] },
          ],
          override: {},
          priority: 2,
        },
      ]),
    ],
  },
];

describe("pruneVariantsForDeletedSegment (EC20)", () => {
  it("removes every variant referencing the deleted segment, keeps the rest", () => {
    const { pages: next, removed } = pruneVariantsForDeletedSegment(pages, "seg_vip");
    expect(removed).toBe(2); // v_seg + v_mixed
    const s1 = next[0].sections[0].variants!;
    const s2 = next[0].sections[1].variants!;
    expect(s1.map((v) => v.id)).toEqual(["v_keep"]);
    expect(s2.map((v) => v.id)).toEqual(["v_exp"]);
  });

  it("does not mutate the input pages", () => {
    const before = JSON.stringify(pages);
    pruneVariantsForDeletedSegment(pages, "seg_vip");
    expect(JSON.stringify(pages)).toBe(before);
  });

  it("is a no-op for an unreferenced segment", () => {
    const { removed } = pruneVariantsForDeletedSegment(pages, "seg_unknown");
    expect(removed).toBe(0);
  });
});

describe("pruneVariantsForDeletedExperiment (EC20)", () => {
  it("removes variants referencing the deleted experiment", () => {
    const { pages: next, removed } = pruneVariantsForDeletedExperiment(pages, "exp_1");
    expect(removed).toBe(1);
    expect(next[0].sections[1].variants!.map((v) => v.id)).toEqual(["v_mixed"]);
  });

  it("is a no-op for an unreferenced experiment", () => {
    expect(pruneVariantsForDeletedExperiment(pages, "exp_x").removed).toBe(0);
  });
});
