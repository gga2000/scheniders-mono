import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { forbidden, requireAdminPermission, type AdminContext } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { hasPermission } from "@/lib/admin-permissions";
import { dayOf, trialClock } from "@/lib/baghdad-day";
import { everyRow } from "@/lib/every-row";

const VALID_TYPES = ["merchants", "transactions", "trials"] as const;
const VALID_FORMATS = ["csv", "json"] as const;

type ExportType = (typeof VALID_TYPES)[number];
type ExportFormat = (typeof VALID_FORMATS)[number];

/** A cell that starts with one of these runs as a formula when the sheet is opened. */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Names, notes and cities are typed by merchants. A leading quote makes the sheet show them as text.
  const safe = typeof value === "string" && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((key) => toCell(row[key])).join(","));

  return [headers.join(","), ...rows].join("\n");
}

/** Shop ids asked for in one read: each id goes into the request's address. */
const IDS_PER_READ = 200;

/** Every shop, or only the shops named in `ids` (the ones ticked on the Merchants page). */
async function fetchMerchants(supabase: ReturnType<typeof createAdminClient>, ids?: readonly string[]) {
  const read = (only?: readonly string[]) =>
    everyRow((from, to) => {
      let query = supabase
        .from("tenants")
        .select(
          "id, business_name, slug, plan, status, city, contact_email, contact_phone, created_at, wallet(balance_iqd, total_charged_iqd, total_topped_up_iqd)"
        )
        // The demo store (Fermi B13) is no customer.
        .eq("is_demo", false);
      if (only) query = query.in("id", [...only]);
      return query.order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
    });

  let data: Awaited<ReturnType<typeof read>>;
  if (ids) {
    data = [];
    for (let start = 0; start < ids.length; start += IDS_PER_READ) {
      data.push(...(await read(ids.slice(start, start + IDS_PER_READ))));
    }
    // Each read is in order; the file is in one order, oldest shop first.
    data.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  } else {
    data = await read();
  }

  return data.map((row) => {
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
  const data = await everyRow((from, to) =>
    supabase
      .from("wallet_transactions")
      .select(
        "id, tenant_id, type, amount_iqd, balance_after_iqd, description, created_at, tenants(business_name)"
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );

  return data.map((row) => {
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
  const data = await everyRow((from, to) =>
    supabase
      .from("tenants")
      .select(
        "id, business_name, slug, plan, trial_ends_at, city, contact_email, created_at"
      )
      .eq("status", "trial")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );

  const now = Date.now();

  // Baghdad calendar days, as on the Trials page: 0 ends today, below 0 ended.
  return data.map((row) => ({
    ...row,
    days_remaining: row.trial_ends_at ? trialClock(row.trial_ends_at, now).days : null,
  }));
}

/** GET /api/export?type=…&format=… — the whole list as a file. */
export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "export_data");
  if (auth instanceof NextResponse) return auth;

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

  // The cross-store wallet ledger is billing data: same gate as
  // GET /api/billing, not just export_data.
  if (type === "transactions" && !hasPermission(auth.role, "adjust_balance")) {
    return forbidden("adjust_balance");
  }

  return exportFile(auth, type, format);
}

/**
 * The shops ticked on the Merchants page. Sent in the body: thousands of ids
 * do not fit in an address.
 */
const SelectedShopsSchema = z.object({
  type: z.literal("merchants"),
  format: z.enum(VALID_FORMATS).default("csv"),
  ids: z.array(z.string().uuid()).min(1).max(5000),
});

/** POST /api/export {type: "merchants", format, ids} — only the ticked shops, as a file. */
export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "export_data");
  if (auth instanceof NextResponse) return auth;

  const parsed = SelectedShopsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  return exportFile(auth, parsed.data.type, parsed.data.format, [...new Set(parsed.data.ids)]);
}

async function exportFile(auth: AdminContext, type: ExportType, format: ExportFormat, ids?: string[]) {
  try {
    const supabase = createAdminClient();

    let data: Record<string, unknown>[];

    switch (type) {
      case "merchants":
        data = await fetchMerchants(supabase, ids);
        break;
      case "transactions":
        data = await fetchTransactions(supabase);
        break;
      case "trials":
        data = await fetchTrials(supabase);
        break;
    }

    await logAdminAction(auth, "export_data", {
      details: { type, format, rows: data.length, ...(ids ? { selected: ids.length } : {}) },
    });

    const date = dayOf(Date.now());
    const filename = `${type}_export_${date}`;

    if (format === "json") {
      return NextResponse.json(data, {
        headers: {
          "Content-Disposition": `attachment; filename="${filename}.json"`,
        },
      });
    }

    const csvString = toCSV(data);

    // The byte-order mark tells Excel the file is UTF-8, so Arabic names open as typed.
    return new NextResponse(`\uFEFF${csvString}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
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
