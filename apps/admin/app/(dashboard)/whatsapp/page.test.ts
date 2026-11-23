import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { monthOf } from "@/lib/baghdad-day";

/*
 * Round 18: an Arabic shop name and its "#id" were drawn as one right-to-left
 * run, so the number landed inside the name or on its wrong side, and the
 * plan and status were printed as stored keys ("growth · limited").
 */

vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: "support_staff" }) }));

const { default: WhatsAppPage } = await import("./page");

const SHOP = {
  tenant_id: "11111111-1111-4111-8111-111111111111",
  display_id: 100_095,
  name: "متجر تجريبي Claude للأزياء",
  plan: "growth",
  status: "limited",
  messages: 3,
  utility: 2,
  marketing: 1,
  shop_paid_iqd: 140,
  trial_utility: 0,
  trial_marketing: 0,
  internal: 0,
  unpaid: 0,
  reached_24h: 0,
  failed_24h: 0,
  bad_24h: 0,
  paused: false,
  pause_reason: null,
  paused_at: null,
};

function render(refreshFailed = false): string {
  const month = monthOf(new Date());
  const client = new QueryClient();
  client.setQueryData(["admin", "whatsapp", month], {
    month,
    month_start: `${month}-01`,
    month_end: `${month}-28`,
    shops: [SHOP],
    totals: { messages: 3, shopPaidIqd: 140, trialMessages: 0, trialCostIqd: 0, unpaid: 0, pausedShops: 0 },
  });
  if (refreshFailed) {
    // Read at 20:00 in Baghdad, then the 2-minute re-read failed.
    client.getQueryCache().find({ queryKey: ["admin", "whatsapp", month] })?.setState({
      status: "error",
      error: new TypeError("Failed to fetch"),
      dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    });
  }
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(WhatsAppPage)));
}

describe("WhatsApp shops", () => {
  it("keeps an Arabic shop name apart from its number", () => {
    expect(render()).toContain(
      `<a dir="auto" class="font-medium text-foreground hover:underline" href="/merchants/${SHOP.tenant_id}">${SHOP.name}</a><span class="text-xs text-foreground/70 tabular-nums">#100095</span>`,
    );
  });

  it("names the plan and the status in the console's words", () => {
    const html = render();
    expect(html).toContain(">Team<");
    expect(html).toContain(" · Paused<");
    expect(html).not.toMatch(/>(growth|limited)<| · limited</);
  });

  // Round 23 (UX new 2): a failed 2-minute re-read kept the last numbers with
  // nothing to say they may be old.
  it("keeps the numbers after a failed re-read and says how old they are", () => {
    const html = render(true);
    expect(html).toMatch(/Could not refresh the WhatsApp numbers\. These numbers are from (\w{3} \d{1,2} \w{3}, )?20:00\./);
    expect(html).toContain(SHOP.name);
    expect(render()).not.toContain("Could not refresh");
  });
});
