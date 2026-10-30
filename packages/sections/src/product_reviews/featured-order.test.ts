// D10 on Wayfarer's six live reviews: احمد الشمري → حازم السيد → مصطفى علي
// → eng. سيف → ياسين → Ahmed (3★), with the 3★ forced into the visible set
// and kept last when the rest expand. Pins (`rank`) come first.

import { describe, expect, it } from "vitest";
import { WAYFER_REVIEWS } from "../_pdp-wayfer-fixtures";
import { featuredOrder } from "./featured-order";
import { reviewThemes, type ThemeWord } from "./theme-words";

const THEMES: ThemeWord[] = [
  { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
  { key: "tester", label_i18n: { ar: "التيستر" }, match_terms: ["تيستر"] },
  { key: "luxury", label_i18n: { ar: "فخامة" }, match_terms: ["فخم"] },
  { key: "packaging", label_i18n: { ar: "العلبة والتغليف" }, match_terms: ["تغليف", "علبه"] },
];

const themeCountOf = (r: { body?: string | null }) => reviewThemes(r.body, [], THEMES).size;
const noRank = () => undefined;
const names = (list: readonly { author_name?: string | null }[]) => list.map((r) => r.author_name);

describe("featuredOrder (D10)", () => {
  it("Wayfarer, visible_count 3: two strongest, then Ahmed; expanded keeps Ahmed last", () => {
    const { visible, all } = featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf: noRank, themeCountOf });
    expect(names(visible)).toEqual(["احمد الشمري", "حازم السيد", "Ahmed"]);
    expect(names(all)).toEqual(["احمد الشمري", "حازم السيد", "مصطفى علي", "eng. سيف", "ياسين", "Ahmed"]);
  });

  it("the visible cards keep their place when the rest expand", () => {
    const { visible, all } = featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf: noRank, themeCountOf });
    expect(all.slice(0, 2)).toEqual(visible.slice(0, 2));
    expect(all[all.length - 1]).toBe(visible[visible.length - 1]);
  });

  it("visible_count 1: the strongest only, never the low one alone", () => {
    expect(names(featuredOrder(WAYFER_REVIEWS, { visibleCount: 1, rankOf: noRank, themeCountOf }).visible)).toEqual([
      "احمد الشمري",
    ]);
  });

  it("visible_count 6: everything, Ahmed last, nothing hidden", () => {
    const { visible, all } = featuredOrder(WAYFER_REVIEWS, { visibleCount: 6, rankOf: noRank, themeCountOf });
    expect(visible).toEqual(all);
    expect(names(visible).at(-1)).toBe("Ahmed");
  });

  it("defaults to 3 visible", () => {
    expect(featuredOrder(WAYFER_REVIEWS, { rankOf: noRank, themeCountOf }).visible).toHaveLength(3);
  });

  it("all 4★ and up: the top N, no forcing", () => {
    const fives = WAYFER_REVIEWS.filter((r) => r.rating >= 4);
    expect(names(featuredOrder(fives, { visibleCount: 3, rankOf: noRank, themeCountOf }).visible)).toEqual([
      "احمد الشمري",
      "حازم السيد",
      "مصطفى علي",
    ]);
  });

  it("a pin (rank) comes before the D10 order", () => {
    const saif = WAYFER_REVIEWS.find((r) => r.author_name === "eng. سيف")?.id;
    const rankOf = (id: string) => (id === saif ? 1 : undefined);
    expect(names(featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf, themeCountOf }).visible)).toEqual([
      "eng. سيف",
      "احمد الشمري",
      "Ahmed",
    ]);
  });

  it("equal reviews keep one order, whatever order they arrive in", () => {
    const reversed = [...WAYFER_REVIEWS].reverse();
    expect(featuredOrder(reversed, { visibleCount: 3, rankOf: noRank, themeCountOf: () => 0 }).all).toEqual(
      featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf: noRank, themeCountOf: () => 0 }).all,
    );
  });
});
