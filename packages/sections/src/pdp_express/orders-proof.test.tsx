// Orders proof: the real weekly count, nothing when it is missing, stale
// (absent) or under the minimum; ink dot under color_lock.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrdersProof } from "./orders-proof";

const html = (count: number | undefined, min?: number, colorLock = false) =>
  renderToStaticMarkup(<OrdersProof count={count} min={min} locale="ar" colorLock={colorLock} />);

describe("OrdersProof", () => {
  it("shows the count as it is", () => {
    const out = html(191);
    expect(out).toContain("191 طلب هذا الأسبوع");
    expect(out).toContain("bg-bk-success");
    expect(out).not.toContain('dir="');
  });

  it("draws nothing without a fresh count or under the minimum", () => {
    expect(html(undefined)).toBe("");
    expect(html(12)).toBe("");
    expect(html(40, 50)).toBe("");
    expect(html(1200, 50)).toContain("1200 طلب هذا الأسبوع");
  });

  it("ink dot under color_lock", () => {
    expect(html(191, undefined, true)).not.toContain("bg-bk-success");
  });
});
