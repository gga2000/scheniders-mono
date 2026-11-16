import { describe, expect, it } from "vitest";
import { inkOn } from "@/lib/ink-on";

describe("inkOn", () => {
  it("puts white on dark brand colours", () => {
    expect(inkOn("#1E1E1E")).toBe("#ffffff");
    expect(inkOn("#7c3aed")).toBe("#ffffff");
  });

  it("puts dark ink on pale or bright brand colours", () => {
    expect(inkOn("#EFFF00")).toBe("#1e1e1e");
    expect(inkOn("#fbcfe8")).toBe("#1e1e1e");
  });

  it("falls back to white when the colour is not a hex", () => {
    expect(inkOn("tomato")).toBe("#ffffff");
  });
});
