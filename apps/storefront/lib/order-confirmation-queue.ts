// =====================================================================
// Instant WhatsApp confirmation: the storefront's half
// =====================================================================
// A storefront order gets the same instant `cod_order_confirm` WhatsApp that
// a Lightfunnels order gets. The storefront never talks to Interakt. It hands
// the NEW order's id to QStash, which delivers it (signed, retried) to the
// platform's POST /api/webhooks/storefront-order. That endpoint re-reads the
// order, takes the tenant from the row and makes every other decision
// (source, is_test, status, tenant allowlist, one send per order).
//
// Only the id travels. submitCheckout calls this for an order that call
// created: never a replay, never a draft-view test order.
//
// The publish runs in next/server `after`, once the buyer has their answer,
// so a slow or failing queue never delays or fails the order. A publish that
// fails is logged with the order id, and the order is flagged for staff
// (needs_attention plus a `whatsapp_*` reason, which the order card shows as
// «فشل واتساب»; a later successful send clears it) so someone confirms it by
// hand.
//
// Server-only: it reads server env (QSTASH_TOKEN, QSTASH_URL,
// STOREFRONT_ORDER_WEBHOOK_URL, never NEXT_PUBLIC_) and uses the service role.
// =====================================================================

import { after } from "next/server";
import { Client } from "@upstash/qstash";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/** Mirrors the platform's whatsapp_* attention reasons
 *  (apps/platform/lib/whatsapp-error-handler.ts): the confirmation was never
 *  handed to the queue, so nobody but staff will confirm this order. */
export const CONFIRMATION_NOT_QUEUED_REASON = "whatsapp_confirmation_not_queued";

/** QStash's own delivery retries to the platform endpoint. That endpoint
 *  answers 500 only for a read or claim failure worth retrying. */
const DELIVERY_RETRIES = 3;

const queueEnvSchema = z.object({
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_URL: z.string().url(),
  STOREFRONT_ORDER_WEBHOOK_URL: z.string().url(),
});

interface QueueConfig {
  token: string;
  baseUrl: string;
  endpointUrl: string;
}

export interface QueuedOrder {
  /** orders.id (uuid) of the order this checkout call created. */
  id: string;
  /** The tenant the checkout resolved, used only to scope the failure flag.
   *  The platform takes the tenant from the order row, never from here. */
  tenantId: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function queueConfig(): { ok: true; config: QueueConfig } | { ok: false; problem: string } {
  const parsed = queueEnvSchema.safeParse({
    QSTASH_TOKEN: readEnv("QSTASH_TOKEN"),
    QSTASH_URL: readEnv("QSTASH_URL"),
    STOREFRONT_ORDER_WEBHOOK_URL: readEnv("STOREFRONT_ORDER_WEBHOOK_URL"),
  });
  if (!parsed.success) {
    return { ok: false, problem: parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
  }
  return {
    ok: true,
    config: {
      token: parsed.data.QSTASH_TOKEN,
      baseUrl: parsed.data.QSTASH_URL,
      endpointUrl: parsed.data.STOREFRONT_ORDER_WEBHOOK_URL,
    },
  };
}

/**
 * Queue the instant WhatsApp confirmation for an order this checkout call
 * just created. Never throws, never delays the response.
 *
 * Without a queue configured, this logs and returns. It does not flag the
 * order: the storefront cannot see the platform's tenant allowlist, so a flag
 * would mark orders «فشل واتساب» for tenants that were never meant to get a
 * message.
 */
export function queueOrderConfirmation(order: QueuedOrder): void {
  const cfg = queueConfig();
  if (!cfg.ok) {
    console.error(
      `[checkout] order ${order.id}: WhatsApp confirmation not queued, storefront env missing or invalid: ${cfg.problem}`,
    );
    return;
  }
  after(() => publishOrderConfirmation(order, cfg.config));
}

async function publishOrderConfirmation(order: QueuedOrder, config: QueueConfig): Promise<void> {
  const client = new Client({ token: config.token, baseUrl: config.baseUrl });
  try {
    await client.publishJSON({
      url: config.endpointUrl,
      body: { order_id: order.id },
      retries: DELIVERY_RETRIES,
      // One message per order even if this were ever called twice for it.
      deduplicationId: `storefront-order-confirmation-${order.id}`,
    });
  } catch (err) {
    console.error(`[checkout] order ${order.id}: WhatsApp confirmation could not be queued:`, err);
    await flagConfirmationNotQueued(order);
  }
}

/** The platform's flagOrderForWhatsAppFailure merge (read, union, write),
 *  scoped to the order's tenant. That helper is platform-only and takes an
 *  Interakt send result this path never has. */
async function flagConfirmationNotQueued(order: QueuedOrder): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data: current, error: readErr } = await supabase
    .from("orders")
    .select("attention_reasons")
    .eq("id", order.id)
    .eq("tenant_id", order.tenantId)
    .maybeSingle();
  if (readErr || !current) {
    console.error(
      `[checkout] order ${order.id}: could not flag the unqueued WhatsApp confirmation for staff:`,
      readErr ?? "order not found in its tenant",
    );
    return;
  }
  const reasons = [...new Set([...(current.attention_reasons ?? []), CONFIRMATION_NOT_QUEUED_REASON])];
  const { error: flagErr } = await supabase
    .from("orders")
    .update({ needs_attention: true, attention_reasons: reasons })
    .eq("id", order.id)
    .eq("tenant_id", order.tenantId);
  if (flagErr) {
    console.error(`[checkout] order ${order.id}: could not flag the unqueued WhatsApp confirmation for staff:`, flagErr);
  }
}
