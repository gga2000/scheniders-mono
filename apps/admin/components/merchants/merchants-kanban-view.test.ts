// Round 3 (r3-13), open until round 17: the Pipeline headed its Active column
// "Paying", so our own never-billed shop sat under "Paying". Active only says
// the store is open; each card's plan pill says whether it is billed.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AdminTenant } from "@/types/admin";

vi.mock("@/hooks/use-merchants-stats", () => ({ useMerchantsStats: () => ({ data: undefined, isError: false }) }));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { MerchantsKanbanView } = await import("./merchants-kanban-view");

const shop = (id: string, plan: AdminTenant["plan"]) =>
  ({
    id,
    business_name: `Shop ${id}`,
    slug: id,
    status: "active",
    plan,
    wallet: { balance_iqd: 0 },
    fees_30d: 0,
    branding: null,
  }) as unknown as AdminTenant;

const html = renderToStaticMarkup(
  createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(MerchantsKanbanView, { merchants: [shop("ours", "internal"), shop("theirs", "starter")] }),
  ),
);

describe("MerchantsKanbanView words", () => {
  it("does not head the Active column with \"Paying\"", () => {
    expect(html).not.toContain(">Paying<");
    expect(html).toContain(">Store open<");
  });

  it("marks our own shop as never billed on its card", () => {
    expect(html).toContain('title="Internal (no billing)">I<');
    expect(html).toContain('title="Starter">S<');
  });
});
