/**
 * The kinds of step the staff log (admin_activity_logs) holds, by the action
 * names the console and its SQL functions write. The Activity page filters by
 * kind and the bell picks an icon by kind. The words for one step stay in
 * lib/staff-actions.ts.
 *
 * The old filter offered names nothing writes (login, create, update,
 * delete, suspend_tenant, impersonate, top_up_wallet), so a filtered page
 * said "No activity logged yet" over a log full of steps.
 */
export type ActivityKind = "shop" | "money" | "leads" | "staff" | "notes" | "support";

interface KindRule {
  value: ActivityKind;
  label: string;
  /** Exact action names. */
  actions: readonly string[];
  /** Families named by their start, such as every support_ step. */
  prefixes: readonly string[];
}

export const ACTIVITY_KINDS: readonly KindRule[] = [
  {
    value: "shop",
    label: "Shop status and plan",
    actions: [
      "status_change", "plan_change", "change_plan", "auto_renew_toggle",
      "extend_trial", "extend_subscription", "convert_trial", "trial_withheld",
      "add_lock_orders", "force_unlock", "pause_tenant", "unpause_tenant",
      "suspend", "bulk_suspend", "reactivate", "pause_whatsapp", "resume_whatsapp", "update_tags",
      "import_products", "import_product_images",
    ],
    prefixes: ["trial_check_"],
  },
  {
    value: "money",
    label: "Money",
    actions: [
      "top_up_wallet", "top_up", "bulk_top_up",
      "approve_topup_request", "reject_topup_request", "update_payment_details",
    ],
    prefixes: [],
  },
  {
    value: "leads",
    label: "Leads",
    actions: ["convert_lead", "build_store_for_lead", "edit_lead", "delete_lead", "reassign_lead", "import_leads", "bulk_leads"],
    prefixes: [],
  },
  {
    value: "staff",
    label: "Staff and settings",
    actions: [
      "grant_admin_access", "remove_admin_access", "update_settings", "update_commission_config",
      "update_signup_whatsapp", "link_prime", "export_data",
      "create_demo_store", "reset_demo_store", "open_demo_store",
    ],
    prefixes: [],
  },
  { value: "notes", label: "Notes", actions: ["add_note", "mention_in_note"], prefixes: [] },
  // Support staff look for what support did, not which support step it was.
  { value: "support", label: "Support", actions: [], prefixes: ["support_"] },
];

export function isActivityKind(value: string): value is ActivityKind {
  return ACTIVITY_KINDS.some((kind) => kind.value === value);
}

/** The kind of one step, or null for a step no kind names. */
export function activityKind(action: string): ActivityKind | null {
  const rule = ACTIVITY_KINDS.find(
    (kind) => kind.actions.includes(action) || kind.prefixes.some((prefix) => action.startsWith(prefix)),
  );
  return rule?.value ?? null;
}

/**
 * A kind as a PostgREST `or` filter on `action`: `action.in.(a,b)` for the
 * names and `action.like.support_*` for each family (`*` is the API's `%`).
 */
export function activityKindFilter(kind: ActivityKind): string {
  const rule = ACTIVITY_KINDS.find((k) => k.value === kind);
  if (!rule) throw new Error(`Unknown activity kind: ${kind}`);
  const parts = [
    ...(rule.actions.length ? [`action.in.(${rule.actions.join(",")})`] : []),
    ...rule.prefixes.map((prefix) => `action.like.${prefix}*`),
  ];
  return parts.join(",");
}
