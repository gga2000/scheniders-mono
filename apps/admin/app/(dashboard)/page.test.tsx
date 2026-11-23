import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { DehydratedState } from "@tanstack/react-query";

/*
 * Speed audit round 3: Home asked for its numbers only after its JS ran (page,
 * then JS, then /api/dashboard/v2). It now reads them on the server, with the
 * same staff check as that route, and arrives with them in.
 */

const staff = vi.hoisted(() => ({ current: null as null | { user: { id: string }; role: string } }));
const read = vi.hoisted(() => vi.fn(async () => ({ kpis: { totalOrders: { value: 7 } } })));
vi.mock("@/lib/api-auth", () => ({ adminFromCookies: async () => staff.current }));
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/dashboard-v2", () => ({ readDashboardV2: read }));
vi.mock("@/lib/admin-fetch", () => ({ leaveIfSignedOut: vi.fn() }));
vi.mock("@/components/dashboard/command-center", () => ({ CommandCenter: () => null }));

import HomePage from "./page";

async function pageState(): Promise<DehydratedState> {
  const page = (await HomePage()) as ReactElement<{ state: DehydratedState }>;
  return page.props.state;
}

describe("Home's server read", () => {
  it("arrives with the numbers for signed-in staff, under the key the page reads", async () => {
    staff.current = { user: { id: "u1" }, role: "super_admin" };
    read.mockClear();
    const state = await pageState();
    expect(read).toHaveBeenCalledOnce();
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].queryKey).toEqual(["admin", "dashboard-v2"]);
    expect(state.queries[0].state.data).toEqual({ kpis: { totalOrders: { value: 7 } } });
  });

  it("reads nothing without a staff sign-in, and leaves the numbers to the browser's own ask", async () => {
    staff.current = null;
    read.mockClear();
    const state = await pageState();
    expect(read).not.toHaveBeenCalled();
    expect(state.queries).toHaveLength(0);
  });

  it("leaves a failed read out of the page, so the browser asks again and shows the failure", async () => {
    staff.current = { user: { id: "u1" }, role: "super_admin" };
    read.mockRejectedValueOnce(new Error("database down"));
    expect((await pageState()).queries).toHaveLength(0);
  });
});
