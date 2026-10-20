import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateNoteSchema = z.object({
  content: z.string().min(1).max(2000),
  mentions: z.array(z.string()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Read — every active admin (both roles hold `add_note`).
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const supabase = createAdminClient();
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "5")));

    const { data, error } = await supabase
      .from("admin_notes")
      .select("*")
      .eq("tenant_id", id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ notes: data ?? [] });
  } catch (error) {
    console.error("Notes API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminPermission(request, "add_note");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = CreateNoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify tenant exists
    const { error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", id)
      .single();

    if (tenantError) {
      if (tenantError.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw tenantError;
    }

    const { data, error } = await supabase
      .from("admin_notes")
      .insert({
        tenant_id: id,
        admin_user_id: auth.user.id,
        admin_label: auth.user.email ?? null,
        content: parsed.data.content,
        is_pinned: false,
      })
      .select()
      .single();

    if (error) throw error;

    // If there are mentions, log activity for each mentioned user
    if (parsed.data.mentions?.length) {
      // Best-effort: don't fail the note creation if notifications fail
      try {
        await supabase
          .from("admin_activity_logs")
          .insert(
            parsed.data.mentions.map((userId) => ({
              admin_user_id: UUID_RE.test(userId) ? userId : null,
              admin_label: UUID_RE.test(userId) ? null : userId,
              tenant_id: id,
              action: "mention_in_note",
              details: {
                note_id: data.id,
                content: parsed.data.content.substring(0, 100),
              },
            }))
          );
      } catch (err) {
        console.error("Failed to log mentions:", err);
      }
    }

    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error) {
    console.error("Notes API error:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}
