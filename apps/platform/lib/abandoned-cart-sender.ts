/**
 * Abandoned-cart WhatsApp recovery sender.
 *
 * Self-contained Interakt send for cart-recovery nudges. Kept separate from
 * lib/interakt.ts (whose pipeline is Order-coupled) so the order flow is
 * untouched — but it reuses the same transport shape, Basic-auth, and phone
 * formatting. Requires an Interakt-approved template named CART_RECOVERY_TEMPLATE.
 */

import { env, providerBaseUrls } from "./env";
import { formatPhoneForInterakt, sharedSenderAllows, type SendTemplateResult } from "./interakt";
import { SHOP_DAILY_CAP_REACHED, takeDailySendSlot, whatsappSendRefusal } from "./whatsapp-wallet";
import { cartItemsSubtotal, type AbandonedCartItem } from "@scheniders/shared";
import { WHATSAPP_TEMPLATES } from "@scheniders/shared/whatsapp-templates";

const INTERAKT_API_URL = `${providerBaseUrls.INTERAKT_API_BASE_URL}/v1/public/message/`;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/** Interakt dashboard template (create + approve there before going live). */
const TEMPLATE = WHATSAPP_TEMPLATES.cartRecovery;
export const CART_RECOVERY_TEMPLATE = TEMPLATE.name;

export interface RecoverableCart {
  id: string;
  /** The store the cart belongs to; must be allowed on the shared number. */
  tenant_id: string;
  phone: string;
  items: AbandonedCartItem[];
  subtotal_iqd: number;
}

interface InteraktBody {
  countryCode: string;
  phoneNumber: string;
  callbackData?: string;
  type: "Template";
  template: { name: string; languageCode: string; bodyValues: string[] };
}

/** Interakt rejects tabs/newlines/double-spaces; empty → "-". */
function sanitizeVar(value: string): string {
  const cleaned = (value ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : "-";
}

function itemsList(items: AbandonedCartItem[]): string {
  return items
    .map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name))
    .join("، ");
}

/** Build the cart-recovery Interakt template body. Exported for tests. */
export function buildCartRecoveryBody(cart: RecoverableCart): InteraktBody {
  const { countryCode, phoneNumber } = formatPhoneForInterakt(cart.phone);
  const subtotal = cart.subtotal_iqd || cartItemsSubtotal(cart.items);
  return {
    countryCode,
    phoneNumber,
    callbackData: cart.id,
    type: "Template",
    template: {
      name: TEMPLATE.name,
      languageCode: TEMPLATE.language,
      bodyValues: [
        "عميلنا العزيز", // {{1}} — customer name (not captured for carts)
        itemsList(cart.items), // {{2}} — products
        `IQD ${subtotal.toLocaleString("en-US")}`, // {{3}} — total
      ].map(sanitizeVar),
    },
  };
}

/**
 * A failed send says whether the message may still have reached the phone:
 * "unknown" when the request left and no answer came back (a timeout or a
 * dropped connection), so the caller must not send it again.
 */
export type CartRecoveryResult = SendTemplateResult & { delivery?: "not_sent" | "unknown" };

/** Interakt answers in well under a second; past this the run must move on. */
const SEND_TIMEOUT_MS = 10_000;

export async function sendCartRecoveryMessage(
  cart: RecoverableCart,
): Promise<CartRecoveryResult> {
  if (!sharedSenderAllows(cart.tenant_id)) {
    return { success: false, error: "This store is not set up to send WhatsApp from the shared number" };
  }
  const apiKey = env.INTERAKT_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Interakt API key not configured" };
  }
  // Paid from the shop's wallet like every message (a trial counts it).
  const refusal = await whatsappSendRefusal(cart.tenant_id, TEMPLATE.category);
  if (refusal) {
    return { success: false, error: refusal, delivery: "not_sent" };
  }
  if (!(await takeDailySendSlot(cart.tenant_id))) {
    return { success: false, error: SHOP_DAILY_CAP_REACHED, delivery: "not_sent" };
  }

  const body = buildCartRecoveryBody(cart);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(INTERAKT_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      const data = (await response.json().catch(() => null)) as {
        result?: boolean;
        message?: string;
        /** The message id, at the top level (see InteraktAPIResponse in lib/interakt). */
        id?: string;
      } | null;

      if (!response.ok || !data) {
        return {
          success: false,
          error: data?.message ?? `HTTP ${response.status}`,
          statusCode: response.status,
          // A gateway error page can come after Interakt already queued it.
          delivery: response.status >= 500 || !data ? "unknown" : "not_sent",
        };
      }
      if (data.result) {
        return { success: true, messageId: typeof data.id === "string" ? data.id : undefined };
      }
      return {
        success: false,
        error: data.message ?? "Unknown error from Interakt API",
        statusCode: response.status,
        delivery: "not_sent",
      };
    } catch (error) {
      // The request may have reached Interakt before the connection dropped:
      // retrying could send the shopper the same paid message twice.
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        delivery: "unknown",
      };
    }
  }

  return { success: false, error: "Interakt rate limit", delivery: "not_sent" };
}
