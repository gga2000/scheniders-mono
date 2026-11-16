import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { env } from "@/lib/admin-env";
import {
  DEMO_OWNER_EMAIL,
  demoActionSchema,
  demoCountsSchema,
  demoCreatedSchema,
  demoOpenUrl,
  demoStorefrontUrl,
} from "@/lib/demo-store";
import storefront from "@/lib/demo-store-storefront.json";

/**
 * The demo store (Fermi B13), super admins only.
 *
 * GET  — the demo store, or null before it exists.
 * POST — { action: "create" }: make the owner and the store, filled.
 *        { action: "reset" }:  empty it and fill it again (seed_demo_store).
 *        { action: "open" }:   a one-time link that signs in as its owner.
 *
 * The database does the walls (no WhatsApp, courier or wallet charge, out of
 * every platform number) and the seed; this route only finds the store and
 * its owner and calls it.
 */

type Admin = ReturnType<typeof createAdminClient>;

async function findDemoStore(supabase: Admin) {
  return supabase
    .from("tenants")
    .select("id, slug, business_name, created_at")
    .eq("is_demo", true)
    .maybeSingle();
}

/** The store's owner: its first active admin, as create_demo_store made it. */
async function findOwner(supabase: Admin, tenantId: string) {
  return supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "manage_demo_store");
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data: store, error } = await findDemoStore(supabase);
  if (error) {
    console.error("[demo-store] read failed:", error.message);
    return NextResponse.json({ error: "Could not read the demo store" }, { status: 500 });
  }
  if (!store) return NextResponse.json({ store: null });

  const [orders, products] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", store.id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", store.id),
  ]);
  if (orders.error || products.error) {
    console.error("[demo-store] count failed:", orders.error?.message ?? products.error?.message);
    return NextResponse.json({ error: "Could not count the demo store's data" }, { status: 500 });
  }

  return NextResponse.json({
    store: {
      ...store,
      orders: orders.count ?? 0,
      products: products.count ?? 0,
      storefront_url: demoStorefrontUrl(store.slug),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "manage_demo_store");
  if (auth instanceof NextResponse) return auth;

  const parsed = demoActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'action must be "create", "reset" or "open"' }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { action } = parsed.data;

  if (action === "create") {
    const { data: existing, error: readError } = await findDemoStore(supabase);
    if (readError) {
      console.error("[demo-store] read failed:", readError.message);
      return NextResponse.json({ error: "Could not read the demo store" }, { status: 500 });
    }
    if (existing) return NextResponse.json({ error: "The demo store already exists" }, { status: 409 });

    // The owner: made now, or found from an earlier try that stopped after
    // making it (the store itself is one transaction, so it is all or nothing).
    let ownerId: string;
    const created = await supabase.auth.admin.createUser({
      email: DEMO_OWNER_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: "متجر مثال" },
    });
    if (created.data.user) {
      ownerId = created.data.user.id;
    } else if (created.error?.code === "email_exists") {
      const found = await supabase.auth.admin.generateLink({ type: "magiclink", email: DEMO_OWNER_EMAIL });
      if (!found.data.user) {
        console.error("[demo-store] owner lookup failed:", found.error?.message);
        return NextResponse.json({ error: "Could not find the demo store's owner" }, { status: 500 });
      }
      ownerId = found.data.user.id;
    } else {
      console.error("[demo-store] owner create failed:", created.error?.message);
      return NextResponse.json({ error: "Could not make the demo store's owner" }, { status: 500 });
    }

    const { data, error } = await supabase.rpc("create_demo_store", {
      _owner_id: ownerId,
      _owner_email: DEMO_OWNER_EMAIL,
      _storefront: storefront,
    });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "The demo store already exists" }, { status: 409 });
      }
      console.error("[demo-store] create failed:", error.message);
      return NextResponse.json({ error: "Could not create the demo store" }, { status: 500 });
    }
    const result = demoCreatedSchema.parse(data);
    await logAdminAction(auth, "create_demo_store", { tenantId: result.tenant_id, details: result.counts });
    return NextResponse.json(result);
  }

  const { data: store, error: storeError } = await findDemoStore(supabase);
  if (storeError) {
    console.error("[demo-store] read failed:", storeError.message);
    return NextResponse.json({ error: "Could not read the demo store" }, { status: 500 });
  }
  if (!store) return NextResponse.json({ error: "There is no demo store yet" }, { status: 404 });

  const { data: owner, error: ownerError } = await findOwner(supabase, store.id);
  if (ownerError) {
    console.error("[demo-store] owner read failed:", ownerError.message);
    return NextResponse.json({ error: "Could not read the demo store's owner" }, { status: 500 });
  }
  if (!owner) return NextResponse.json({ error: "The demo store has no owner" }, { status: 409 });

  if (action === "reset") {
    const { data, error } = await supabase.rpc("seed_demo_store", {
      _tenant_id: store.id,
      _owner_id: owner.user_id,
      _storefront: storefront,
    });
    if (error) {
      console.error("[demo-store] reset failed:", error.message);
      return NextResponse.json({ error: "Could not reset the demo store" }, { status: 500 });
    }
    const counts = demoCountsSchema.parse(data);
    await logAdminAction(auth, "reset_demo_store", { tenantId: store.id, details: counts });
    return NextResponse.json({ counts });
  }

  // action === "open"
  if (!env.PLATFORM_URL) {
    return NextResponse.json({ error: "PLATFORM_URL is not set for the staff console" }, { status: 500 });
  }
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("id", owner.user_id)
    .maybeSingle();
  if (profileError || !profile?.email) {
    console.error("[demo-store] owner email read failed:", profileError?.message ?? "no profile");
    return NextResponse.json({ error: "Could not read the demo store's owner" }, { status: 500 });
  }
  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email: profile.email });
  const hashedToken = link.data.properties?.hashed_token;
  if (!hashedToken) {
    console.error("[demo-store] sign-in link failed:", link.error?.message);
    return NextResponse.json({ error: "Could not make the sign-in link" }, { status: 500 });
  }
  await logAdminAction(auth, "open_demo_store", { tenantId: store.id });
  return NextResponse.json({ url: demoOpenUrl(env.PLATFORM_URL, hashedToken) });
}
