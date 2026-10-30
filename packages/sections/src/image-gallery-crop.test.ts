// The proof stack's screenshot box (spec §1.5 "Crop maths"): `left` /
// `right` are percents of the uncropped width; the box keeps the cropped
// width over the full height, so nothing is cut at the bottom.

import { describe, expect, it } from "vitest";
import { STACK_SIZES, stackFrame } from "./image-gallery-crop";

describe("stackFrame", () => {
  it("the spec example: { left: 12, right: 2 } on 828×253", () => {
    expect(stackFrame({ width: 828, height: 253, crop: { left: 12, right: 2 } })).toEqual({
      kind: "sized",
      aspectRatio: "712.08 / 253",
      imageWidth: "116.28%",
      imageLeft: "-13.95%",
      sizes: "(max-width: 640px) calc((100vw - 2rem) * 100 / 86), calc(600px * 100 / 86)",
    });
  });

  it("a symmetric crop keeps 80% of the width", () => {
    expect(stackFrame({ width: 1000, height: 500, crop: { left: 10, right: 10 } })).toEqual({
      kind: "sized",
      aspectRatio: "800 / 500",
      imageWidth: "125%",
      imageLeft: "-12.5%",
      sizes: "(max-width: 640px) calc((100vw - 2rem) * 100 / 80), calc(600px * 100 / 80)",
    });
  });

  it("no crop: the natural ratio, the image at full width", () => {
    expect(stackFrame({ width: 828, height: 160 })).toEqual({
      kind: "sized",
      aspectRatio: "828 / 160",
      imageWidth: "100%",
      imageLeft: "0%",
      sizes: STACK_SIZES,
    });
  });

  it("sizes: the column width and its cap, both scaled by 100 / kept", () => {
    // The image renders at 100/kept % of the box, so next/image must pick a
    // candidate that much wider than the column, or comment text goes soft.
    const frame = stackFrame({ width: 828, height: 253, crop: { left: 12.5, right: 2 } });
    expect(frame.kind === "sized" && frame.sizes).toBe(
      "(max-width: 640px) calc((100vw - 2rem) * 100 / 85.5), calc(600px * 100 / 85.5)",
    );
  });

  it("sizes: a zero crop is the plain column hint", () => {
    expect(STACK_SIZES).toBe("(max-width: 640px) calc(100vw - 2rem), 600px");
    const frame = stackFrame({ width: 828, height: 160, crop: { left: 0, right: 0 } });
    expect(frame.kind === "sized" && frame.sizes).toBe(STACK_SIZES);
  });

  it.each([
    [{ height: 253 }],
    [{ width: 828 }],
    [{ crop: { left: 12, right: 2 } }],
  ])("without both sizes: a 4/1 fill box and no crop (%j)", (input) => {
    expect(stackFrame(input)).toEqual({ kind: "fill" });
  });
});
