import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Seen live (round 17): a Merchants card clipped what stuck out of it, so its
 * status menu lost 58-71 px, the alert pop-up 97-137 px and the health card up
 * to 46 px at 1280-1440. Only the decorative glow needs clipping, so it gets
 * its own clipped layer and the card clips nothing.
 */
const source = readFileSync(join(__dirname, "merchant-card.tsx"), "utf8");

describe("a Merchants card's pop-ups", () => {
  it("are not cut off by the card", () => {
    const card = source.match(/"pastel-card [^"]*"/)?.[0] ?? "";
    expect(card).toContain("pastel-card");
    expect(card).not.toMatch(/overflow-(hidden|clip)/);
  });

  it("still keep the glow inside the card's corners", () => {
    expect(source).toMatch(/absolute inset-0 overflow-hidden rounded-\[inherit\] pointer-events-none/);
  });
});
