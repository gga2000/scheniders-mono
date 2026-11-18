import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Round 15: the page started its two reads during render, so the server render
 * ran them too, with no session and a relative address. They start in the
 * browser only.
 */
const adminFetch = vi.hoisted(() => vi.fn(async () => new Response("{}")));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch, leaveIfSignedOut: vi.fn() }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ user: null, role: null, isLoading: true }) }));

import SettingsPage from "./page";

describe("Settings in the server render", () => {
  it("reads nothing", async () => {
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(html).toContain("Settings");
    expect(adminFetch).not.toHaveBeenCalled();
  });
});
