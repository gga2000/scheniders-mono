import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireBearerAdmin } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";
import { LEAD_IMPORT_MAX_ROWS, leadImportRow, type LeadImportResult } from "@/lib/lead-import";

const bodySchema = z.object({ leads: z.array(z.record(z.string(), z.unknown())) });

/**
 * Save the rows of an uploaded leads file, one by one, and say what happened
 * to each: saved, skipped (no merchant name) or failed, with the reason.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireBearerAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "leads array required" }, { status: 400 });
    }
    if (body.data.leads.length > LEAD_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          error: `This file has ${body.data.leads.length} rows. One import takes up to ${LEAD_IMPORT_MAX_ROWS}: split the file and import each part.`,
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result: LeadImportResult = { created: 0, skipped: 0, failed: 0, failures: [] };
    const fail = (index: number, name: string, reason: string) => {
      result.failed++;
      result.failures.push({ row: index + 1, name, reason });
    };

    for (const [index, raw] of body.data.leads.entries()) {
      const lead = leadImportRow(raw);
      if (lead.kind === "skip") {
        result.skipped++;
        continue;
      }
      if (lead.kind === "bad") {
        fail(index, lead.name, lead.reason);
        continue;
      }

      // Attribute every imported lead to the admin running the import.
      const { error } = await supabase.from("leads").insert({ ...lead.row, created_by: admin.user.id });
      if (error) fail(index, lead.row.merchant_name, error.message);
      else result.created++;
    }

    await logAdminAction(admin, "import_leads", {
      details: {
        rows: body.data.leads.length,
        created: result.created,
        skipped: result.skipped,
        failed: result.failed,
      },
    });

    return NextResponse.json(result, { status: result.created > 0 ? 201 : 200 });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "The import stopped part way. Some rows may be saved: check the leads list before importing again." },
      { status: 500 },
    );
  }
}
