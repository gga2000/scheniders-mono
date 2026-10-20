"use client";

import { useEffect, useState } from "react";
import { normalizeIraqiMobile } from "@scheniders/shared";

/**
 * A shopper's points balance, from the storefront's /api/loyalty/balance.
 *
 * The route answers only with proof that the caller is that customer: a
 * previous order number of this store placed with this phone (it checks the
 * pair the way order tracking does, rate-limited). A phone number alone gets
 * nothing, so the checkout and the PDP form ask for that order number before
 * they show or redeem points.
 */
export interface LoyaltyBalanceQuery {
  tenantId: string;
  /** Already normalised (07XXXXXXXXX). */
  phone: string;
  orderNumber: string;
}

/**
 * The balance, or null when the route does not give one: no matching order
 * (404), rate-limited (429), unavailable (503), or the request itself failed.
 * Every one of those means the same thing to the form — no points to offer —
 * and the checkout re-reads the balance before it redeems anything.
 */
export async function fetchLoyaltyBalance(query: LoyaltyBalanceQuery, signal?: AbortSignal): Promise<number | null> {
  let res: Response;
  try {
    res = await fetch("/api/loyalty/balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: query.tenantId, phone: query.phone, order_number: query.orderNumber }),
      signal,
    });
  } catch {
    // Offline, or aborted because the inputs changed: there is no balance to show.
    return null;
  }
  if (!res.ok) return null;
  const body: unknown = await res.json().catch(() => null);
  const balance = (body as { balance?: unknown } | null)?.balance;
  return typeof balance === "number" ? balance : null;
}

/**
 * Debounced balance for the phone + proving order number the shopper typed.
 * Null until both are present and answered; drops back to null the moment
 * either input changes, so one number can never show (or spend) another's
 * points.
 */
export function useLoyaltyBalance(input: {
  enabled: boolean;
  tenantId: string;
  phone: string;
  orderNumber: string;
}): number | null {
  const phone = normalizeIraqiMobile(input.phone);
  const orderNumber = input.orderNumber.trim();
  const key = input.enabled && phone && orderNumber ? `${input.tenantId}|${phone}|${orderNumber}` : null;
  const [answer, setAnswer] = useState<{ key: string; balance: number } | null>(null);
  const tenantId = input.tenantId;

  useEffect(() => {
    if (!key || !phone) return;
    let active = true;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      void fetchLoyaltyBalance({ tenantId, phone, orderNumber }, controller.signal).then((balance) => {
        if (active && balance !== null) setAnswer({ key, balance });
      });
    }, 600);
    return () => {
      active = false;
      clearTimeout(handle);
      controller.abort();
    };
  }, [key, tenantId, phone, orderNumber]);

  return answer !== null && answer.key === key ? answer.balance : null;
}
