/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const H = vi.hoisted(() => ({
  state: { data: [] as unknown[], isError: false },
}));

vi.mock("@/hooks/use-open-store-captures", () => ({
  useOpenStoreCaptures: () => H.state,
}));
vi.mock("@/hooks/use-language", async () => {
  const { translations } = await import("@/lib/i18n");
  return {
    useLanguage: () => ({
      language: "ar",
      setLanguage: () => undefined,
      t: (key: string) => translations.ar[key] ?? key,
    }),
  };
});

import { translations } from "@/lib/i18n";
import { StoreCapturesPanel } from "./store-captures-panel";

afterEach(() => {
  cleanup();
  H.state = { data: [], isError: false };
});

const consented = {
  id: "c1",
  phone: "07701234567",
  items: [{ product_id: "p1", variant_id: null, name: "عطر تجريبي", quantity: 2, price: 12500 }],
  subtotal_iqd: 25000,
  governorate: "BG",
  updated_at: "2026-10-21T10:00:00.000Z",
  consent_at: "2026-10-21T10:00:00.000Z",
  reminded_at: null,
};
const unconsented = { ...consented, id: "c2", phone: "07801234567", consent_at: null };

describe("StoreCapturesPanel", () => {
  it("renders nothing while there are no open captures, so the tab is unchanged", () => {
    const { container } = render(<StoreCapturesPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("lists each capture with a call link, the product, the amount and its consent", () => {
    H.state = { data: [consented, unconsented], isError: false };
    render(<StoreCapturesPanel />);
    expect(screen.getByTestId("store-captures").textContent).toContain(translations.ar["orders.captures.title"]);
    expect(screen.getByText(translations.ar["orders.captures.hint"])).toBeTruthy();
    const rows = screen.getAllByTestId("store-capture");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('a[href="tel:07701234567"]')).not.toBeNull();
    expect(rows[0].textContent).toContain("عطر تجريبي × 2");
    expect(rows[0].textContent).toContain("25,000");
    expect(rows[0].textContent).toContain(translations.ar["orders.captures.consent"]);
    expect(rows[1].textContent).toContain(translations.ar["orders.captures.noConsent"]);
  });

  it("says so when the read failed", () => {
    H.state = { data: [], isError: true };
    render(<StoreCapturesPanel />);
    expect(screen.getByRole("alert").textContent).toBe(translations.ar["orders.captures.loadFailed"]);
  });
});
