import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";
import { logAdminActivity } from "@/lib/activity-logger";
import { staffReasonSchema } from "@/lib/staff-reason";
import { topUpWallet, topupAmountSchema, topupRequestIdSchema } from "@/lib/wallet-topup";

const topupSchema = z.object({
  tenant_id: z.string().uuid(),
  amount: topupAmountSchema,
  // Why the money is added. It goes on the wallet line and in the staff log.
  description: staffReasonSchema,
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
      { error: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { tenant_id, amount, request_id, description } = parsed.data;

  const result = await topUpWallet({
    tenantId: tenant_id,
    amount,
    description,
    adminUserId: auth.user.id,
    requestId: request_id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.noWallet ? 404 : 500 });
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
