import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";
import { topUpWallet, topupAmountSchema, topupRequestIdSchema } from "@/lib/wallet-topup";

const topupSchema = z.object({
  tenant_id: z.string().uuid(),
  amount: topupAmountSchema,
  description: z.string().trim().max(500).optional(),
  request_id: topupRequestIdSchema,
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "top_up_wallet");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = topupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { tenant_id, amount, request_id } = parsed.data;
  const description = parsed.data.description || "Admin top-up";

  const result = await topUpWallet({
    tenantId: tenant_id,
    amount,
    description,
    adminUserId: auth.user.id,
    requestId: request_id,
  });

  if (!result.ok) {
    console.error("[billing/topup] Top-up failed:", tenant_id, result.error);
    const status = result.error === "No wallet found" ? 404 : 500;
    return NextResponse.json({ error: `Top-up failed: ${result.error}` }, { status });
  }

  // A repeat of a request that was already credited moved no money: the first
  // call is the one on record.
  if (!result.duplicate) {
    await logAdminActivity({
      adminUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      tenantId: tenant_id,
      action: "top_up_wallet",
      details: { amount_iqd: amount, description, new_balance_iqd: result.newBalance },
    });
  }

  return NextResponse.json({
    success: true,
    newBalance: result.newBalance,
    duplicate: result.duplicate,
  });
}
