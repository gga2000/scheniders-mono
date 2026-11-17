import type { TenantStatus } from "@/types/admin";

/**
 * A trial shop becomes a paying shop on its own page, through "Start paid time,
 * no charge" (convert-trial), never by picking Active: `admin_update_shop`
 * refuses `active` over a trial (`still_trial`). The card menu and the Pipeline
 * leave that move out, and the refusal names the real button.
 */
export const STILL_TRIAL_REFUSAL =
  'This shop is on trial. Open its page and use "Start paid time, no charge" to make it a paying shop.';

/** Whether staff may move a shop from `from` to `to` by picking a status. */
export function canPickStatus(from: TenantStatus, to: TenantStatus): boolean {
  return !(from === "trial" && to === "active");
}
