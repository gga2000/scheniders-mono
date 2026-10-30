/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { parseRecovery } from "@/lib/orders/abandoned-cart-recovery";

const H = vi.hoisted(() => ({
  state: { data: undefined as unknown, isError: false },
}));

vi.mock("@/hooks/use-abandoned-cart-recovery", async (orig) => ({
  ...(await orig<typeof import("@/hooks/use-abandoned-cart-recovery")>()),
  useAbandonedCartRecovery: () => H.state,
}));
vi.mock("@/components/ui/financial-value", () => ({
  FinancialValue: ({ amount }: { amount: number | null }) => <span>{amount === null ? "MASK" : String(amount)}</span>,
}));
vi.mock("@/hooks/use-language", async () => {
  const { translations } = await import("@/lib/i18n");
  return {
    useLanguage: () => ({
      language: "en",
      setLanguage: () => undefined,
      t: (key: string, vars?: Record<string, string | number>) =>
        Object.entries(vars ?? {}).reduce(
          (s, [k, v]) => s.replace(`{${k}}`, String(v)),
          translations.en[key] ?? key,
        ),
    }),
  };
});

import { AbandonedCartRecoveryStrip } from "./abandoned-cart-recovery-strip";

afterEach(() => {
  cleanup();
  H.state = { data: undefined, isError: false };
});

const live = parseRecovery({
  days: 30,
  open: 14,
  open_stale: 4,
  recovered: 23,
  recovered_completed: 8,
  recovered_iqd: 302000,
  returned: 2,
  rate: 62.2,
  removed: { junk_phone: 0, junk_location: 18, already_ordered: 1, expired: 45 },
  by_staff: [{ name: "whatsapp_bot", recovered: 21 }, { name: "karrar", recovered: 2 }],
});

describe("AbandonedCartRecoveryStrip", () => {
  it("renders nothing when there are no carts in the window", () => {
    H.state = { data: parseRecovery({}), isError: false };
    const { container } = render(<AbandonedCartRecoveryStrip />);
    expect(container.innerHTML).toBe("");
  });

  it("shows open, recovered, returned, rate, removed reasons and staff", () => {
    H.state = { data: live, isError: false };
    render(<AbandonedCartRecoveryStrip />);
    const text = screen.getByTestId("abandoned-cart-recovery").textContent ?? "";
    expect(text).toContain("last 30 days");
    expect(text).toContain("4 older than 3 days");
    expect(text).toContain("8 delivered");
    expect(text).toContain("302000");
    expect(text).toContain("62.2%");
    expect(text).toContain("18 no location · 1 already ordered · 45 untouched for 14 days");
    expect(text).not.toContain("incomplete number");
    expect(text).toContain("WhatsApp bot 21 · karrar 2");
    expect(screen.getByRole("link", { name: "Open trash" }).getAttribute("href")).toBe("/orders/trash");
  });

  it("masks the IQD when the server withheld it", () => {
    H.state = { data: { ...live, recovered_iqd: null }, isError: false };
    render(<AbandonedCartRecoveryStrip />);
    expect(screen.getByTestId("abandoned-cart-recovery").textContent).toContain("MASK");
  });

  it("parseRecovery turns junk into zeros and keeps a withheld amount null", () => {
    const r = parseRecovery({ open: "x", recovered_iqd: "nope", removed: null });
    expect(r.open).toBe(0);
    expect(r.recovered_iqd).toBeNull();
    expect(r.removed.expired).toBe(0);
    expect(r.by_staff).toEqual([]);
  });
});
