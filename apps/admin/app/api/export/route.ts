import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

const VALID_TYPES = ["merchants", "transactions", "trials"] as const;
const VALID_FORMATS = ["csv", "json"] as const;

type ExportType = (typeof VALID_TYPES)[number];
type ExportFormat = (typeof VALID_FORMATS)[number];

function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const headerRow = headers.join(",");

  const rows = data.map((row) =>
    headers
      .map((key) => {
        const value = row[key];
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  return [headerRow, ...rows].join("\n");
}

async function fetchMerchants(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, business_name, slug, plan, status, city, contact_email, contact_phone, created_at, wallet(balance_iqd, total_charged_iqd, total_topped_up_iqd)"
    );

  if (error) throw error;

  return (data ?? []).map((row) => {
    const wallet = Array.isArray(row.wallet) ? row.wallet[0] : row.wallet;
    return {
      id: row.id,
      business_name: row.business_name,
      slug: row.slug,
      plan: row.plan,
      status: row.status,
      city: row.city,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      created_at: row.created_at,
      balance_iqd: wallet?.balance_iqd ?? 0,
      total_charged_iqd: wallet?.total_charged_iqd ?? 0,
      total_topped_up_iqd: wallet?.total_topped_up_iqd ?? 0,
    };
  });
}

async function fetchTransactions(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(
      "id, tenant_id, type, amount_iqd, balance_after_iqd, description, created_at, tenants(business_name)"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      type: row.type,
      amount_iqd: row.amount_iqd,
      balance_after_iqd: row.balance_after_iqd,
      description: row.description,
      created_at: row.created_at,
      business_name: tenant?.business_name ?? "",
    };
  });
}

async function fetchTrials(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, business_name, slug, plan, trial_ends_at, city, contact_email, created_at"
    )
    .eq("status", "trial");

  if (error) throw error;

  const now = Date.now();

  return (data ?? []).map((row) => {
    const trialEnd = new Date(row.trial_ends_at).getTime();
    const days_remaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    return {
      ...row,
      days_remaining,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const type = searchParams.get("type") as ExportType | null;
    const format = (searchParams.get("format") ?? "csv") as ExportFormat;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!VALID_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${VALID_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    let data: Record<string, unknown>[];

    switch (type) {
      case "merchants":
        data = await fetchMerchants(supabase);
        break;
      case "transactions":
        data = await fetchTransactions(supabase);
        break;
      case "trials":
        data = await fetchTrials(supabase);
        break;
    }

    const date = new Date().toISOString().split("T")[0];
    const filename = `${type}_export_${date}`;

    if (format === "json") {
      return NextResponse.json(data, {
        headers: {
          "Content-Disposition": `attachment; filename="${filename}.json"`,
        },
      });
    }

    const csvString = toCSV(data);

    return new NextResponse(csvString, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
