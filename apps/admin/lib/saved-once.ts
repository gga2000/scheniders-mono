import { NextResponse } from "next/server";
import { z } from "zod";
import type { createAdminClient } from "@/lib/admin-supabase";
import { PAGE_OUT_OF_DATE, staffRequestIdSchema } from "@/lib/staff-reason";

/*
 * One saved row per ask for a lead's follow-ups and notes and a shop's notes
 * (staff console audit, N8). A save whose answer was lost (a 504, a dropped
 * connection) was saved again when staff pressed Save a second time. The
 * console now sends one id per ask, kept until it goes through; the row keeps
 * it under a unique index (migration 20261123080216_staff_notes_request_ids),
 * so the database refuses the second row and the route answers with the first.
 */

/** The id every such save carries. A tab from before ids is told to reload. */
export const SaveRequestIdSchema = z.object({ request_id: staffRequestIdSchema });

/** The tables whose rows keep their request id, each with its unique index. */
const KEPT = {
  lead_follow_ups: "lead_follow_ups_request_id_key",
  lead_activities: "lead_activities_request_id_key",
  admin_notes: "admin_notes_request_id_key",
} as const;

export type SavedOnceTable = keyof typeof KEPT;

/** A save from a tab opened before ids: the words that say to reload, else null. */
export function staleTabWords(error: z.ZodError): string | null {
  return error.issues.find((issue) => issue.path[0] === "request_id")?.message ?? null;
}

/** The database refused a second row with this request id: the first save went through. */
export function savedBefore(error: { code?: string; message?: string } | null, table: SavedOnceTable): boolean {
  return error?.code === "23505" && Boolean(error.message?.includes(KEPT[table]));
}

/**
 * The answer to a repeat: the first row, marked duplicate, under `key` as the
 * first answer had it. The row is read by its id and its owner (the lead or
 * the shop), so an id sent for another lead never hands back that lead's row.
 */
export async function firstSaveAnswer(
  supabase: ReturnType<typeof createAdminClient>,
  table: SavedOnceTable,
  key: string,
  requestId: string,
  owner: { column: "lead_id" | "tenant_id"; id: string },
): Promise<NextResponse> {
  const { data, error } = await supabase
    .from(table)
    .select()
    .eq("request_id", requestId)
    .eq(owner.column, owner.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return NextResponse.json({ error: PAGE_OUT_OF_DATE }, { status: 409 });
  }
  return NextResponse.json({ [key]: data, duplicate: true });
}
