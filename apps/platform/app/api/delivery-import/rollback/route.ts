import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";

const bodySchema = z.object({ importId: z.uuid() });

const resultSchema = z.object({
    restored: z.number(),
    changed_since: z.number(),
    skipped: z.number(),
});

/**
 * POST /api/delivery-import/rollback
 *
 * Undo a CONFIRMED delivery import, in one transaction (rollback_delivery_import):
 * each order goes back to the fields captured on the server just before the import
 * wrote them, but only while it still has the status the import gave it. Orders
 * changed since then by staff or the courier are left alone and counted as
 * `changedSince`. The import is then marked "cancelled".
 */
export async function POST(request: NextRequest) {
    try {
        // Tenant admins only; the tenant is the caller's verified active tenant.
        const caller = await requireRequestCaller(request, "tenant-admin");
        if (!caller.ok) return caller.response;

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Missing or invalid importId" }, { status: 400 });
        }
        const { importId } = parsed.data;

        const { data, error } = await createSupabaseServiceClient().rpc("rollback_delivery_import", {
            p_tenant_id: caller.tenantId,
            p_import_id: importId,
        });

        if (error) {
            if (error.code === "P0002") {
                return NextResponse.json({ success: false, error: "Import record not found" }, { status: 404 });
            }
            if (error.code === "22023") {
                return NextResponse.json({ success: false, error: error.message }, { status: 400 });
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const result = resultSchema.parse(data);
        return NextResponse.json({
            success: true,
            data: {
                importId,
                restored: result.restored,
                changedSince: result.changed_since,
                skipped: result.skipped,
            },
        });
    } catch (error) {
        console.error("Delivery import rollback error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to roll back import" },
            { status: 500 }
        );
    }
}
