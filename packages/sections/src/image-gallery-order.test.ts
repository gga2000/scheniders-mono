import { describe, expect, it } from "vitest";
import { orderGalleryImages } from "./image-gallery-order";

const THIS = "p-this";
const OTHER = "p-other";
const imgs = [
  { url: "a" },
  { url: "b", product_ids: [OTHER] },
  { url: "c", product_ids: [THIS] },
  { url: "d" },
  { url: "e", product_ids: [OTHER, THIS] },
  { url: "f", product_ids: [] },
];
const urls = (list: { url: string }[]) => list.map((i) => i.url);

describe("orderGalleryImages", () => {
  it("returns the same array when not opted in", () => {
    expect(orderGalleryImages(imgs, undefined, THIS)).toBe(imgs);
  });

  it("returns the same array off a product page", () => {
    expect(orderGalleryImages(imgs, "product_first", undefined)).toBe(imgs);
  });

  it("this product first, then untagged, then other products, each in order", () => {
    expect(urls(orderGalleryImages(imgs, "product_first", THIS))).toEqual([
      "c", "e", "a", "d", "f", "b",
    ]);
  });

  it("with no tags at all, keeps the current order", () => {
    const plain = [{ url: "x" }, { url: "y" }, { url: "z" }];
    expect(urls(orderGalleryImages(plain, "product_first", THIS))).toEqual(["x", "y", "z"]);
  });
});
