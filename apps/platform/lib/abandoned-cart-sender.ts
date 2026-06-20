/**
 * Abandoned-cart WhatsApp recovery sender.
 *
 * Self-contained Interakt send for cart-recovery nudges. Kept separate from
 * lib/interakt.ts (whose pipeline is Order-coupled) so the order flow is
 * untouched — but it reuses the same transport shape, Basic-auth, and phone
 * formatting. Requires an Interakt-approved template named CART_RECOVERY_TEMPLATE.
 */

import { env } from "./env";
import { formatPhoneForInterakt, type SendTemplateResult } from "./interakt";
import { cartItemsSubtotal, type AbandonedCartItem } from "@scheniders/shared";

const INTERAKT_API_URL = "https://api.interakt.ai/v1/public/message/";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/** Interakt dashboard template name (create + approve there before going live). */
export const CART_RECOVERY_TEMPLATE = "abandoned_cart_recovery";

export interface RecoverableCart {
  id: string;
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
      name: CART_RECOVERY_TEMPLATE,
      languageCode: "ar",
      bodyValues: [
        "عميلنا العزيز", // {{1}} — customer name (not captured for carts)
        itemsList(cart.items), // {{2}} — products
        `IQD ${subtotal.toLocaleString("en-US")}`, // {{3}} — total
      ].map(sanitizeVar),
    },
  };
}

export async function sendCartRecoveryMessage(
  cart: RecoverableCart,
): Promise<SendTemplateResult> {
  const apiKey = env.INTERAKT_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Interakt API key not configured" };
  }

  const body = buildCartRecoveryBody(cart);
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(INTERAKT_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      const data = (await response.json().catch(() => null)) as {
        result?: boolean;
        message?: string;
        data?: { message_id?: string };
      } | null;

      if (!response.ok || !data) {
        return {
          success: false,
          error: data?.message ?? `HTTP ${response.status}`,
          statusCode: response.status,
        };
      }
      if (data.result) {
        return { success: true, messageId: data.data?.message_id };
      }
      return {
        success: false,
        error: data.message ?? "Unknown error from Interakt API",
        statusCode: response.status,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network error";
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  return { success: false, error: lastError ?? "Max retries exceeded" };
}
