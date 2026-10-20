import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const body = await request.json();
    const { leads: importLeads } = body;

    if (!importLeads || !Array.isArray(importLeads)) {
      return NextResponse.json({ error: "leads array required" }, { status: 400 });
    }

    if (importLeads.length > 500) {
      return NextResponse.json({ error: "Max 500 leads per import" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const lead of importLeads) {
      try {
        if (!lead.merchant_name) {
          results.skipped++;
          continue;
        }

        const { error } = await supabase.from("leads").insert({
          merchant_name: lead.merchant_name,
          platform: lead.platform || "other",
          platform_url: lead.platform_url || null,
          handle: lead.handle ? String(lead.handle).trim().replace(/^@+/, "") : null,
          follower_count: Number(lead.follower_count) || 0,
          management_name: lead.management_name || null,
          page_phone: lead.page_phone || null,
          phone_numbers: lead.phone_numbers || [],
          avg_view_count: Number(lead.avg_view_count) || 0,
          avg_like_count: Number(lead.avg_like_count) || 0,
          avg_comments_count: Number(lead.avg_comments_count) || 0,
          avg_order_count: Number(lead.avg_order_count) || 0,
          address: lead.address || null,
          city: lead.city || null,
          industry_id: lead.industry_id || null,
          priority: lead.priority || "medium",
          // Attribute every imported lead to the admin running the import.
          created_by: admin.user.id,
        });

        if (error) {
          results.errors.push(`${lead.merchant_name}: ${error.message}`);
        } else {
          results.created++;
        }
      } catch {
        results.skipped++;
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Failed to import leads" }, { status: 500 });
  }
}
