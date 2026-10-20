import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const body = await request.json();
    const supabase = createAdminClient();

    const duplicates: { id: string; merchant_name: string; match_type: string }[] = [];

    // Check by phone
    if (body.phone_numbers && body.phone_numbers.length > 0) {
      const normalizedPhone = body.phone_numbers[0].number?.replace(/[^0-9]/g, "");
      if (normalizedPhone) {
        const { data: phoneMatches } = await supabase
          .from("leads")
          .select("id, merchant_name")
          .eq("normalized_phone", normalizedPhone)
          .limit(5);

        if (phoneMatches) {
          for (const m of phoneMatches) {
            duplicates.push({ ...m, match_type: "phone" });
          }
        }
      }
    }

    // Check by name
    if (body.merchant_name) {
      const normalizedName = body.merchant_name.toLowerCase().replace(/\s+/g, "");
      const { data: nameMatches } = await supabase
        .from("leads")
        .select("id, merchant_name")
        .eq("normalized_name", normalizedName)
        .limit(5);

      if (nameMatches) {
        for (const m of nameMatches) {
          if (!duplicates.find((d) => d.id === m.id)) {
            duplicates.push({ ...m, match_type: "name" });
          }
        }
      }

      // Also fuzzy match
      const { data: fuzzyMatches } = await supabase
        .from("leads")
        .select("id, merchant_name")
        .ilike("merchant_name", `%${body.merchant_name}%`)
        .limit(5);

      if (fuzzyMatches) {
        for (const m of fuzzyMatches) {
          if (!duplicates.find((d) => d.id === m.id)) {
            duplicates.push({ ...m, match_type: "similar_name" });
          }
        }
      }
    }

    return NextResponse.json({ duplicates });
  } catch (error) {
    console.error("Duplicates check error:", error);
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500 });
  }
}
