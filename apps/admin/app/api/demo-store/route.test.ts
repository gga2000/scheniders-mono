import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const COUNTS = { products: 40, variants: 86, orders: 290, abandoned_carts: 8, expenses: 33 };

type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

/** Each table answers what the test put here; every builder method chains. */
let tables: Record<string, Result>;
const filters: Record<string, unknown[][]> = {};
const rpc = vi.fn();
const createUser = vi.fn();
const generateLink = vi.fn();

function builder(table: string) {
  const answer = () => Promise.resolve(tables[table] ?? { data: null, error: null });
  const q = {
    select: () => q,
    eq: (...args: unknown[]) => {
      (filters[table] ??= []).push(args);
      return q;
    },
    order: () => q,
    limit: () => q,
    maybeSingle: answer,
    then: (resolve: (r: Result) => void) => answer().then(resolve),
  };
  return q;
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: builder,
    rpc,
    auth: { admin: { createUser, generateLink } },
  }),
}));

const logAdminAction = vi.fn(async () => undefined);
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "super_admin" })),
}));

const env: { PLATFORM_URL?: string } = { PLATFORM_URL: "https://app.example.com" };
vi.mock("@/lib/admin-env", () => ({ env }));

const { GET, POST } = await import("./route");

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/demo-store", { method: "POST", body: JSON.stringify(body) }));
}

const demoRow = { id: STORE, slug: "mithal", business_name: "متجر مثال", created_at: "2026-11-16T08:00:00Z" };

beforeEach(() => {
  tables = {};
  for (const k of Object.keys(filters)) delete filters[k];
  rpc.mockReset();
  createUser.mockReset();
  generateLink.mockReset();
  logAdminAction.mockClear();
  env.PLATFORM_URL = "https://app.example.com";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/demo-store", () => {
  it("answers null before the demo store exists", async () => {
    tables.tenants = { data: null, error: null };
    const res = await GET(new NextRequest("http://localhost/api/demo-store"));
    expect(await res.json()).toEqual({ store: null });
    expect(filters.tenants).toContainEqual(["is_demo", true]);
  });

  it("shows the store with its counts and its own address", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.orders = { data: null, error: null, count: 290 };
    tables.products = { data: null, error: null, count: 40 };
    const body = await (await GET(new NextRequest("http://localhost/api/demo-store"))).json();
    expect(body.store).toEqual({ ...demoRow, orders: 290, products: 40, storefront_url: "https://mithal.usefermi.com" });
    expect(filters.orders).toContainEqual(["tenant_id", STORE]);
  });
});

describe("POST /api/demo-store create", () => {
  it("makes the owner, then the store in one call, and logs it", async () => {
    tables.tenants = { data: null, error: null };
    createUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    rpc.mockResolvedValue({ data: { tenant_id: STORE, counts: COUNTS }, error: null });

    const res = await post({ action: "create" });
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "demo@usefermi.com", email_confirm: true }));
    // No password: the only way in is the console's one-time link.
    expect(createUser.mock.calls[0][0]).not.toHaveProperty("password");
    expect(rpc).toHaveBeenCalledWith("create_demo_store", {
      _owner_id: OWNER,
      _owner_email: "demo@usefermi.com",
      _storefront: expect.objectContaining({ pages: expect.any(Array) }),
    });
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "create_demo_store", { tenantId: STORE, details: COUNTS });
  });

  it("reuses the owner an earlier try made", async () => {
    tables.tenants = { data: null, error: null };
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "exists", code: "email_exists" } });
    generateLink.mockResolvedValue({ data: { user: { id: OWNER }, properties: {} }, error: null });
    rpc.mockResolvedValue({ data: { tenant_id: STORE, counts: COUNTS }, error: null });

    expect((await post({ action: "create" })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("create_demo_store", expect.objectContaining({ _owner_id: OWNER }));
  });

  it("refuses a second demo store before touching Auth", async () => {
    tables.tenants = { data: demoRow, error: null };
    const res = await post({ action: "create" });
    expect(res.status).toBe(409);
    expect(createUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is a 409 when the database finds one first, and logs nothing", async () => {
    tables.tenants = { data: null, error: null };
    createUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: "exists", code: "23505" } });
    expect((await post({ action: "create" })).status).toBe(409);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("stops when the owner cannot be made", async () => {
    tables.tenants = { data: null, error: null };
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "down", code: "unexpected_failure" } });
    expect((await post({ action: "create" })).status).toBe(500);
    expect(generateLink).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/demo-store reset", () => {
  it("refills the store for its owner and logs the counts", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    tables.tenant_members = { data: { user_id: OWNER }, error: null };
    rpc.mockResolvedValue({ data: COUNTS, error: null });

    const res = await post({ action: "reset" });
    expect(await res.json()).toEqual({ counts: COUNTS });
    expect(rpc).toHaveBeenCalledWith("seed_demo_store", {
      _tenant_id: STORE,
      _owner_id: OWNER,
      _storefront: expect.objectContaining({ pages: expect.any(Array) }),
    });
    expect(filters.user_profiles).toContainEqual(["email", "demo@usefermi.com"]);
    expect(filters.tenant_members).toEqual(
      expect.arrayContaining([["tenant_id", STORE], ["user_id", OWNER], ["role", "admin"], ["status", "active"]]),
    );
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "reset_demo_store", { tenantId: STORE, details: COUNTS });
  });

  it("is a 404 before the store exists", async () => {
    tables.tenants = { data: null, error: null };
    expect((await post({ action: "reset" })).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses when the demo account is no longer the store's admin", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    tables.tenant_members = { data: null, error: null };
    const res = await post({ action: "reset" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/demo@usefermi\.com/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is a 500 and logs nothing when the seed fails", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    tables.tenant_members = { data: { user_id: OWNER }, error: null };
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await post({ action: "reset" })).status).toBe(500);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe("POST /api/demo-store open", () => {
  it("answers a one-time sign-in link to the merchant app's orders page", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.tenant_members = { data: { user_id: OWNER }, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    generateLink.mockResolvedValue({ data: { user: { id: OWNER }, properties: { hashed_token: "tok123" } }, error: null });

    const { url } = await (await post({ action: "open" })).json();
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "demo@usefermi.com" });
    expect(url).toBe("https://app.example.com/api/auth/confirm?token_hash=tok123&type=magiclink&next=%2Forders");
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "open_demo_store", { tenantId: STORE });
  });

  it("never signs staff in as someone another admin added in its place", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    tables.tenant_members = { data: null, error: null };
    expect((await post({ action: "open" })).status).toBe(409);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("refuses a link whose sign-in is not the owner row's", async () => {
    tables.tenants = { data: demoRow, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    tables.tenant_members = { data: { user_id: OWNER }, error: null };
    generateLink.mockResolvedValue({ data: { user: { id: ADMIN_ID }, properties: { hashed_token: "tok123" } }, error: null });
    expect((await post({ action: "open" })).status).toBe(409);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("says what is missing when PLATFORM_URL is not set", async () => {
    env.PLATFORM_URL = undefined;
    tables.tenants = { data: demoRow, error: null };
    tables.user_profiles = { data: { id: OWNER }, error: null };
    tables.tenant_members = { data: { user_id: OWNER }, error: null };
    const res = await post({ action: "open" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/PLATFORM_URL/);
    expect(generateLink).not.toHaveBeenCalled();
  });
});

it("refuses an unknown action", async () => {
  expect((await post({ action: "delete" })).status).toBe(400);
});
