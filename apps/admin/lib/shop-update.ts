import { z } from "zod";
import type { PlanTier, TenantStatus } from "@/types/admin";
import type { createAdminClient } from "./admin-supabase";
import { STATUS_REFUSALS } from "./shop-status-choice";

/**
 * What staff ask for. Any part may be left out; at least one of status, plan
 * and auto_renew is set. `reason` is staff's own words, kept on each staff log
 * row of the change (a hold from the shop page asks for one).
 */
export type ShopChange = { status?: TenantStatus; plan?: PlanTier; auto_renew?: boolean; reason?: string };

export type ShopUpdateActor = { id: string; email?: string | null };

/** The shop as `admin_update_shop` left it, and what that call changed. */
const updatedShopSchema = z.object({
  success: z.literal(true),
  tenant_id: z.string(),
  status: z.string(),
  plan: z.string(),
  auto_renew: z.boolean().nullable(),
  pending_plan: z.string().nullable(),
  changed: z.array(z.string()),
});
const refusedSchema = z.object({ success: z.literal(false), error: z.string() });

export type UpdatedShop = Omit<z.infer<typeof updatedShopSchema>, "success" | "tenant_id"> & { id: string };

export type ShopUpdateResult =
  | { ok: true; shop: UpdatedShop }
  | { ok: false; status: 404 | 409; error: string };

/**
 * The demo store (Fermi B13) stays open for everyone who is shown it: no
 * status change and no pause. Said the same way wherever staff meet it.
 */
export const DEMO_STORE_REFUSAL = "This is the demo store. Its status does not change.";

/** Why the database refused, in words staff can act on. */
export const SHOP_UPDATE_REFUSALS: Record<string, { status: 404 | 409; error: string }> = {
  not_found: { status: 404, error: "Merchant not found" },
  demo_store: { status: 409, error: DEMO_STORE_REFUSAL },
  // The status moves the card menu and the Pipeline also hold back (lib/shop-status-choice).
  use_pause: { status: 409, error: STATUS_REFUSALS.use_pause },
  paused: { status: 409, error: STATUS_REFUSALS.paused },
  still_trial: { status: 409, error: STATUS_REFUSALS.still_trial },
  not_trialing: { status: 409, error: STATUS_REFUSALS.not_trialing },
  no_subscription: { status: 409, error: "This shop has no subscription yet." },
  subscription_ended: {
    status: 409,
    error: "This shop's subscription has ended, so it would never be billed for a paid plan. The plan stays as it is.",
  },
};

/**
 * Change a shop's status, plan or auto-renew through `admin_update_shop`. One
 * transaction checks the change, writes the shop and its newest subscription,
 * and writes the staff log rows, so the three cannot disagree. The database
 * refuses what would leave a shop in a state billing cannot read: 'active'
 * over a trial, 'limited' without a pause, any status over a paused shop, a
 * status change of the demo store, a paid plan on a shop whose subscription
 * renewal does not bill (none, cancelled, incomplete). A value the shop already has is not
 * written and not logged.
 *
 * Shared by PATCH /api/merchants/[id] and the bulk actions.
 */
export async function updateShop(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  change: ShopChange,
  actor: ShopUpdateActor,
  source: "single" | "bulk" = "single",
): Promise<ShopUpdateResult> {
  const { data, error } = await supabase.rpc("admin_update_shop", {
    _tenant_id: tenantId,
    _status: change.status ?? null,
    _plan: change.plan ?? null,
    _auto_renew: change.auto_renew ?? null,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    _source: source,
    ...(change.reason ? { _reason: change.reason } : {}),
  });
  if (error) throw error;

  const refused = refusedSchema.safeParse(data);
  if (refused.success) {
    const refusal = SHOP_UPDATE_REFUSALS[refused.data.error];
    if (!refusal) throw new Error(`Unexpected refusal from admin_update_shop: ${refused.data.error}`);
    return { ok: false, ...refusal };
  }

  const { tenant_id: id, status, plan, auto_renew, pending_plan, changed } = updatedShopSchema.parse(data);
  return { ok: true, shop: { id, status, plan, auto_renew, pending_plan, changed } };
}
