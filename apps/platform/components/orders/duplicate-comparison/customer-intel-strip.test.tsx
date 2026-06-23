/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CustomerIntelStrip } from "./customer-intel-strip";
import type { CustomerStats } from "@/lib/duplicate-comparison";

afterEach(cleanup);

const stats: CustomerStats = {
  totalOrders: 7,
  totalSpent: 248750,
  deliveredCount: 5,
  completedCount: 1,
  cancelledCount: 1,
  cancelRate: 0.14,
};

const labels = {
  repeat: "عميل متكرر",
  totalOrders: "إجمالي الطلبات",
  totalSpent: "إجمالي الإنفاق",
  cancelRate: "نسبة الإلغاء",
  lastOrder: "آخر طلب",
};

describe("CustomerIntelStrip", () => {
  it("renders totals, repeat badge and cancel rate percentage", () => {
    render(
      <CustomerIntelStrip
        stats={stats}
        isRepeat
        lastOrderRelative="منذ 18 ساعة"
        labels={labels}
      />,
    );
    expect(screen.getByText("عميل متكرر")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText(/14%/)).toBeTruthy();
    expect(screen.getByText(/منذ 18 ساعة/)).toBeTruthy();
  });

  it("renders nothing when no orders", () => {
    const { container } = render(
      <CustomerIntelStrip
        stats={{ ...stats, totalOrders: 0 }}
        isRepeat={false}
        lastOrderRelative=""
        labels={labels}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
