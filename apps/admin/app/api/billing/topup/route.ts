import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";
import { staffRateLimit } from "@/lib/staff-rate-limit";
import { logAdminActivity } from "@/lib/activity-logger";
import { staffReasonSchema, staffRequestIdSchema } from "@/lib/staff-reason";
import { topUpWallet, topupAmountSchema } from "@/lib/wallet-topup";

const topupSchema = z.object({
  tenant_id: z.string().uuid(),
  amount: topupAmountSchema,
  // Why the money is added. It goes on the wallet line and in the staff log.
  description: staffReasonSchema,
  // Made once by the browser for one top-up and sent again on a retry, so a
  // double click or a lost answer credits the wallet once.
  request_id: staffRequestIdSchema,
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "top_up_wallet");
  if (auth instanceof NextResponse) return auth;
  const limited = await staffRateLimit(auth.user.id, "top-up");
  if (limited) return limited;

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
