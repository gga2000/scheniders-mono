import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";

const UpdateTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).max(20),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = UpdateTagsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("tenants")
      .update({ tags: parsed.data.tags })
      .eq("id", id)
      .select("tags")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ tags: data.tags });
  } catch (error) {
    console.error("Tags API error:", error);
    return NextResponse.json(
      { error: "Failed to update tags" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("tenants")
      .select("tags")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ tags: data.tags ?? [] });
  } catch (error) {
    console.error("Tags API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
