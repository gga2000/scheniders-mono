import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { SUPPORT_CASE_COLUMNS, sortInbox, type SupportCaseRow } from "@/lib/support";

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

    const cases = (casesResult.data ?? []) as unknown as SupportCaseRow[];
    return NextResponse.json({
      cases: view === "open" ? sortInbox(cases) : cases,
      waitingOnUs: waitingResult.count ?? 0,
    });
  } catch (error) {
    console.error("Support cases API error:", error);
    return NextResponse.json({ error: "Failed to load support conversations" }, { status: 500 });
  }
}
