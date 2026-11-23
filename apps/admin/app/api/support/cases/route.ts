import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { SUPPORT_CASE_COLUMNS, sortInbox, type SupportCaseRow, type SupportInboxRow } from "@/lib/support";

/**
 * When each listed conversation's first change request was sent ("Need a
 * change?" in the merchant header): the 24-hour promise runs from it until the
 * conversation is solved. `ids` null means every unsolved one (up to 300 ids,
 * too long for one URL); otherwise just those ids (the latest 100 solved).
 */
async function changeRequestTimes(supabase: ReturnType<typeof createAdminClient>, ids: string[] | null): Promise<Map<string, string>> {
  if (ids !== null && ids.length === 0) return new Map();
  const asked = supabase
    .from("support_messages")
    .select("case_id, created_at, support_cases!inner(status)")
    .eq("context->>kind", "change_request")
    .order("created_at", { ascending: true });
  const { data, error } = await (ids === null ? asked.neq("support_cases.status", "solved") : asked.in("case_id", ids));
  if (error) throw error;
  const first = new Map<string, string>();
  for (const row of data ?? []) if (!first.has(row.case_id)) first.set(row.case_id, row.created_at);
  return first;
}

/**
 * The support inbox. `view=open` (default) lists every unsolved conversation,
 * the merchant waiting longest first; `view=solved` lists the latest solved;
 * `view=count` answers only how many merchants are waiting on us.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "handle_support");
  if (auth instanceof NextResponse) return auth;

  const requested = new URL(request.url).searchParams.get("view");
  const view = requested === "solved" || requested === "count" ? requested : "open";

  try {
    const supabase = createAdminClient();

    if (view === "count") {
      const { count, error } = await supabase
        .from("support_cases")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting_us");
      if (error) throw error;
      return NextResponse.json({ waitingOnUs: count ?? 0 });
    }

    const list = supabase.from("support_cases").select(SUPPORT_CASE_COLUMNS);
    const [casesResult, waitingResult] = await Promise.all([
      view === "solved"
        ? list.eq("status", "solved").order("solved_at", { ascending: false }).limit(100)
        : list.neq("status", "solved").order("last_message_at", { ascending: false }).limit(300),
      supabase.from("support_cases").select("id", { count: "exact", head: true }).eq("status", "waiting_us"),
    ]);

    if (casesResult.error) throw casesResult.error;
    if (waitingResult.error) throw waitingResult.error;

    const listed = (casesResult.data ?? []) as unknown as SupportCaseRow[];
    const asked = await changeRequestTimes(supabase, view === "open" ? null : listed.map((c) => c.id));
    const cases: SupportInboxRow[] = listed.map((c) => ({ ...c, change_requested_at: asked.get(c.id) ?? null }));
    return NextResponse.json({
      cases: view === "open" ? sortInbox(cases) : cases,
      waitingOnUs: waitingResult.count ?? 0,
    });
  } catch (error) {
    console.error("Support cases API error:", error);
    return NextResponse.json({ error: "Failed to load support conversations" }, { status: 500 });
  }
}
