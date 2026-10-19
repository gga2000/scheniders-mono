import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";

const impersonateSchema = z.object({
  tenant_id: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "impersonate");
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = impersonateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tenant_id } = parsed.data;
    const supabase = createAdminClient();

    // Fetch the tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, business_name, slug, status")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    if (tenant.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot impersonate a cancelled tenant" },
        { status: 400 }
      );
    }

    // Log the impersonation action — record the real admin actor.
    // Non-blocking: the helper reports a write failure and does not throw.
    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: tenant_id,
      action: "impersonate",
      details: {
        tenant_id,
        business_name: tenant.business_name,
      },
    });

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        business_name: tenant.business_name,
        slug: tenant.slug,
      },
      storefront_url: `/storefront/${tenant.slug}`,
    });
  } catch (error) {
    console.error("Impersonate API error:", error);
    return NextResponse.json(
      { error: "Failed to impersonate tenant" },
      { status: 500 }
    );
  }
}
