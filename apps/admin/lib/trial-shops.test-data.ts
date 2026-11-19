import type { Row } from "@/lib/supabase-stub.test-data";

/** A shop on trial as the tenants read returns it, with its wallet. */
export const trial = (n: number, trialEndsAt: string, extra: Row = {}): Row => ({
  id: `shop-${String(n).padStart(5, "0")}`,
  is_demo: false, is_prospect: false,
  business_name: `Shop ${n}`,
  slug: `shop-${n}`,
  plan: "starter",
  status: "trial",
  trial_ends_at: trialEndsAt,
  city: "Kut",
  contact_email: null,
  created_at: "2026-11-10T09:00:00Z",
  wallet: [{ balance_iqd: 4_000 }],
  ...extra,
});

export const facts = (id: string, extra: Row = {}): Row => ({
  tenant_id: id,
  created_at: "2026-11-10T09:00:00Z",
  owner_phone: "07701234567",
  orders: 0, delivered: 0, shipped: false,
  whatsapp_sent: 0, whatsapp_cap: 200,
  prime_linked: false,
  trial_check: null, trial_check_decision: null,
  lock_reason: null,
  last_call: null,
  ...extra,
});
