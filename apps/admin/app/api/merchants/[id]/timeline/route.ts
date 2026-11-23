import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import {
  timelineCutoff,
  toTimelineEntries,
  withinCutoff,
  type LogRow,
  type NoteRow,
  type WalletRow,
} from "@/lib/shop-timeline";
import { notAnId } from "@/lib/route-id";
import { readStaffProfiles, staffNames } from "@/lib/staff-names";

/** Rows read from each table per page. */
const PAGE = 100;

/**
 * One dated list for a shop: wallet rows, logged staff and support steps, and
 * notes, newest first. `before` (a time the last page returned) reads the next
 * page. Read: every active admin, like the shop page itself.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;
  const beforeParam = new URL(request.url).searchParams.get("before");
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? beforeParam : null;

  const supabase = createAdminClient();
  const page = <T extends { lt: (column: string, value: string) => T }>(query: T): T =>
    before ? query.lt("created_at", before) : query;

  const [wallet, logs, notes] = await Promise.all([
    page(
      supabase
        .from("wallet_transactions")
        .select("id, type, amount_iqd, balance_after_iqd, description, created_by, created_at")
        .eq("tenant_id", id),
    )
      .order("created_at", { ascending: false })
      .limit(PAGE),
    page(
      supabase
        .from("admin_activity_logs")
        .select("id, admin_user_id, admin_label, actor_email, action, details, created_at")
        .eq("tenant_id", id),
    )
      .order("created_at", { ascending: false })
      .limit(PAGE),
    page(
      supabase
        .from("admin_notes")
        .select("id, admin_user_id, admin_label, content, created_at")
        .eq("tenant_id", id),
    )
      .order("created_at", { ascending: false })
      .limit(PAGE),
  ]);

  for (const result of [wallet, logs, notes]) {
    if (result.error) {
      console.error("[merchants/timeline] read failed:", id, result.error.message);
      return NextResponse.json({ error: "Could not load the timeline." }, { status: 500 });
    }
  }

  const walletRows = (wallet.data ?? []) as WalletRow[];
  const logRows = (logs.data ?? []) as LogRow[];
  const noteRows = (notes.data ?? []) as NoteRow[];

  let names: Map<string, string>;
  try {
    names = staffNames(
      await readStaffProfiles(supabase, [
        ...walletRows.map((row) => row.created_by),
        ...logRows.map((row) => row.admin_user_id),
        ...noteRows.map((row) => row.admin_user_id),
      ]),
    );
  } catch (error) {
    console.error("[merchants/timeline] names failed:", id, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not load the timeline." }, { status: 500 });
  }

  const cutoff = timelineCutoff([walletRows, logRows, noteRows], PAGE);
  const entries = withinCutoff(toTimelineEntries({ wallet: walletRows, logs: logRows, notes: noteRows, names }), cutoff);

  return NextResponse.json({ entries, nextBefore: cutoff });
}
