import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * A staff page reads that person's leads with an "or" filter built from the
 * id in the address. Only a user id gets that far, so the address cannot
 * change the filter.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (id: string) =>
  GET(new NextRequest(`http://admin.test/api/team/${encodeURIComponent(id)}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  stub = supabaseStub();
});

describe("GET /api/team/[id]", () => {
  it("refuses an id that is not a user id, before any read", async () => {
    const res = await call("x,status.eq.lost");

    expect(res.status).toBe(404);
    expect(stub.tablesRead()).toEqual([]);
  });
});
