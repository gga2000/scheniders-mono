import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const plan = searchParams.get("plan");
    const status = searchParams.get("status");
    const city = searchParams.get("city");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") ?? "created_at";
    const order = searchParams.get("order") ?? "desc";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));

    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    let query = supabase
      .from("tenants")
      .select("*, wallet(*), subscriptions(*)", { count: "exact" });

    if (plan) {
      query = query.eq("plan", plan);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (city) {
      query = query.eq("city", city);
    }

    if (search) {
      query = query.or(
        `business_name.ilike.%${search}%,slug.ilike.%${search}%,contact_email.ilike.%${search}%`
      );
    }

    query = query
      .order(sort, { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      merchants: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("Merchants API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchants" },
      { status: 500 }
    );
  }
}
