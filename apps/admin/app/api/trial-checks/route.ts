import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { readTrialChecks } from "@/lib/trial-checks";

/** Stores the one-trial check flagged (Fermi B5), open ones first. */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await readTrialChecks(createAdminClient()));
  } catch (error) {
    console.error("Trial checks API error:", error);
    return NextResponse.json({ error: "Failed to fetch trial checks" }, { status: 500 });
  }
}
