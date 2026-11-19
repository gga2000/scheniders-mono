import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_UI } from "@/types/leads";

/*
 * Round 3 (r3-15), open until round 17: the lead page drew its stage chip in
 * the old neon accent, "New" in #EFFF00 on a 15% tint of itself, 1.1:1 in the
 * light theme. Every stage now takes its ink and tint from LEAD_STATUS_UI (the
 * --ink-* colours, AA in both themes), and the neon accents are gone.
 */
describe("lead stage colours", () => {
  it("give every stage an ink and its own tint, and nothing else a colour", () => {
    for (const [stage, config] of Object.entries(LEAD_STATUS_CONFIG)) {
      expect(Object.keys(config)).toEqual(["label"]);
      const ui = LEAD_STATUS_UI[stage as keyof typeof LEAD_STATUS_UI];
      expect(ui.solid).toMatch(/^var\(--ink-[a-z]+\)$/);
      expect(ui.soft).toContain(ui.solid);
    }
  });

  it("draw the lead page's stage chip, desktop and phone, in ink on its tint", () => {
    for (const file of ["lead-detail-desktop.tsx", "mobile/lead-mobile-detail.tsx"]) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source).toContain("style={{ backgroundColor: statusUi.soft, color: statusUi.solid }}");
    }
  });
});
