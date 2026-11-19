import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";
import type { FetchedImage } from "@/lib/product-import-images";

const guard = vi.hoisted(() => ({ allowed: true, actions: [] as string[] }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async (_request: unknown, action: string) => {
    guard.actions.push(action);
    return guard.allowed
      ? { user: { id: "9a1c2b3d-0000-4000-8000-000000000001", email: "noor@fermi.test" }, role: "support_staff" }
      : NextResponse.json({ error: "Your login cannot do this. Ask a super admin." }, { status: 403 });
  },
}));

/** What each link gives, as lib/product-import-images.ts answers (its own test covers the fetching). */
const web = vi.hoisted(() => ({ answers: {} as Record<string, FetchedImage>, asked: [] as string[] }));
vi.mock("@/lib/product-import-images", () => ({
  fetchImage: async (link: string) => {
    web.asked.push(link);
    return web.answers[link] ?? { ok: false, reason: "The link did not open" };
  },
}));

const STORAGE = "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public";
const store = { uploads: [] as Array<{ bucket: string; path: string; type: string; upsert: boolean }>, removed: [] as string[][], refuse: new Set<string>() };
let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    ...stub.client,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, options: { contentType: string; upsert: boolean }) => {
          if (store.refuse.has(path.split("-").pop() ?? "")) return { data: null, error: { message: "storage down" } };
          store.uploads.push({ bucket, path, type: options.contentType, upsert: options.upsert });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE}/${bucket}/${path}` } }),
        remove: async (paths: string[]) => {
          store.removed.push(paths);
          return { data: [], error: null };
        },
      }),
    },
  }),
}));

const { POST } = await import("./route");
const SHOP = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";
const PRODUCT = "5b0b0b0b-0000-4000-8000-000000000002";
const call = (body: unknown, id = SHOP) =>
  POST(
    new NextRequest(`http://admin.test/api/merchants/${id}/product-import/images`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

const jpeg: FetchedImage = { ok: true, bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]), kind: { type: "image/jpeg", ext: "jpg" } };
const png: FetchedImage = { ok: true, bytes: new Uint8Array([0x89, 0x50]), kind: { type: "image/png", ext: "png" } };

beforeEach(() => {
  stub = supabaseStub();
  guard.allowed = true;
  guard.actions = [];
  web.answers = {
    "https://a.example/1.jpg": jpeg,
    "https://a.example/2.png": png,
    "https://a.example/page": { ok: false, reason: "The link is not a JPEG, PNG, WebP or GIF image" },
  };
  web.asked = [];
  store.uploads = [];
  store.removed = [];
  store.refuse = new Set();
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.tables.products = [
    { id: PRODUCT, tenant_id: SHOP },
    { id: "6c0c0c0c-0000-4000-8000-000000000003", tenant_id: "7e5f7eac-fbf5-43fa-bcb2-b9bf66b04eae" },
  ];
  stub.state.functions.admin_attach_product_images = (args) => ({
    data: { image_url: (args.p_urls as string[])[0], added: (args.p_urls as string[]).length },
    error: null,
  });
});

describe("POST /api/merchants/[id]/product-import/images", () => {
  it("saves the images that are real in the gallery's storage and puts them on the product", async () => {
    const res = await call({ productId: PRODUCT, links: ["https://a.example/1.jpg", "https://a.example/page", "https://a.example/2.png"] });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(guard.actions).toEqual(["import_products"]);
    expect(store.uploads).toHaveLength(2);
    expect(store.uploads[0]).toMatchObject({ bucket: "product-images", type: "image/jpeg", upsert: false });
    expect(store.uploads[0]?.path).toMatch(new RegExp(`^gallery/${PRODUCT}/import-\\d+-1\\.jpg$`));
    expect(store.uploads[1]?.path).toMatch(new RegExp(`^gallery/${PRODUCT}/import-\\d+-3\\.png$`));
    const urls = store.uploads.map((u) => `${STORAGE}/product-images/${u.path}`);
    expect(stub.state.rpcCalls).toEqual([
      {
        fn: "admin_attach_product_images",
        args: {
          p_tenant: SHOP,
          p_product: PRODUCT,
          p_urls: urls,
          p_admin_user_id: "9a1c2b3d-0000-4000-8000-000000000001",
          p_actor_email: "noor@fermi.test",
        },
      },
    ]);
    // The database takes only links of this shape (admin_attach_product_images).
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/product-images\/[A-Za-z0-9/_.-]+$/);
    }
    expect(body).toEqual({
      saved: 2,
      imageUrl: urls[0],
      failed: [{ link: "https://a.example/page", reason: "The link is not a JPEG, PNG, WebP or GIF image" }],
    });
  });

  it("names an image storage would not take, and saves the others", async () => {
    store.refuse.add("1.jpg");
    const body = await (await call({ productId: PRODUCT, links: ["https://a.example/1.jpg", "https://a.example/2.png"] })).json();
    expect(body.saved).toBe(1);
    expect(body.failed).toEqual([{ link: "https://a.example/1.jpg", reason: "The image could not be saved" }]);
  });

  it("writes nothing when no link gives an image", async () => {
    const body = await (await call({ productId: PRODUCT, links: ["https://a.example/page", "https://a.example/gone"] })).json();
    expect(body).toEqual({
      saved: 0,
      imageUrl: null,
      failed: [
        { link: "https://a.example/page", reason: "The link is not a JPEG, PNG, WebP or GIF image" },
        { link: "https://a.example/gone", reason: "The link did not open" },
      ],
    });
    expect(store.uploads).toHaveLength(0);
    expect(stub.state.rpcCalls).toHaveLength(0);
  });

  it("removes the saved files when the database refuses them", async () => {
    stub.state.functions.admin_attach_product_images = () => ({ data: null, error: { code: "P0002", message: "no such product in this shop" } as { message: string } });
    expect((await call({ productId: PRODUCT, links: ["https://a.example/1.jpg"] })).status).toBe(404);
    expect(store.removed).toEqual([[store.uploads[0]?.path]]);

    stub.state.functions.admin_attach_product_images = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call({ productId: PRODUCT, links: ["https://a.example/2.png"] })).status).toBe(500);
    expect(store.removed).toHaveLength(2);
  });

  it("fetches nothing for another shop's product, a bad body or a login without the right", async () => {
    expect((await call({ productId: "6c0c0c0c-0000-4000-8000-000000000003", links: ["https://a.example/1.jpg"] })).status).toBe(404);
    expect((await call({ productId: PRODUCT, links: [] })).status).toBe(400);
    expect((await call({ productId: PRODUCT, links: Array.from({ length: 9 }, (_, i) => `https://a.example/${i}.jpg`) })).status).toBe(400);
    expect((await call({ productId: "x", links: ["https://a.example/1.jpg"] })).status).toBe(400);
    expect((await call({ productId: PRODUCT, links: ["https://a.example/1.jpg"] }, "not-a-shop")).status).toBe(404);
    guard.allowed = false;
    expect((await call({ productId: PRODUCT, links: ["https://a.example/1.jpg"] })).status).toBe(403);
    expect(web.asked).toHaveLength(0);
    expect(store.uploads).toHaveLength(0);
  });
});
