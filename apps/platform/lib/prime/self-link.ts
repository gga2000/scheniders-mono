import { z } from "zod";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { isPrimeUnreachable, type PrimeClient, type PrimeMerchantAccount } from "@/lib/prime/client";
import type { PrimeLinkOutcome } from "@/lib/prime/link-outcomes";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/**
 * A store links its own Prime account (Fermi A3). The store's admin types the
 * phone of their Prime account; Prime lists the merchants it has linked to our
 * integrated system, and the one with that login or phone is theirs.
 *
 * - One active shop, and no other store uses or asked for the account: the
 *   link is made at once (link_prime_request).
 * - Several shops: the store picks one.
 * - Anything else waits on the request with the reason, and the prime-sync
 *   cron looks again: not_linked until Prime links the account to our
 *   system, no_shop until it has an active shop, prime_down until Prime
 *   answers. An account another store uses waits for our team (shared_account).
 */

/** Outcomes the cron looks at again by itself; the others wait on a person. */
export const PRIME_LINK_RECHECKED: readonly PrimeLinkOutcome[] = ["not_linked", "no_shop", "prime_down"];

export type PrimeShopChoice = { id: number; name: string };

export type PrimeLinkResult = { outcome: "connected" } | { outcome: PrimeLinkOutcome; shops?: PrimeShopChoice[] };

/** The open request the check works on. */
export type PrimeLinkRequestRow = { id: string; tenant_id: string; prime_phone: string };

/**
 * A Prime login or phone in the one form stores are compared by: a phone as
 * 07XXXXXXXXX, anything else trimmed and lower-cased. Mirrors the database's
 * public.prime_merchant_key, which keys prime_connections for B5.
 */
export function primeMerchantKey(login: string): string {
    const trimmed = login.trim().toLowerCase();
    const compact = trimmed.replace(/[\s-]/g, "");
    return /^(\+?964|00964|0)?7\d{9}$/.test(compact) ? `0${compact.slice(-10)}` : trimmed;
}

/**
 * The merchant whose login, or else whose phone, is this Prime phone. A login
 * names one account; a phone can sit on two, and then no account is picked
 * (our team sorts it out with Prime).
 */
export function findPrimeMerchant(merchants: PrimeMerchantAccount[], phone: string): PrimeMerchantAccount | null {
    const key = primeMerchantKey(phone);
    const active = merchants.filter((m) => m.active !== false);
    const byLogin = active.find((m) => primeMerchantKey(m.loginId) === key);
    if (byLogin) return byLogin;
    const byPhone = active.filter((m) => m.phone1 && primeMerchantKey(m.phone1) === key);
    return byPhone.length === 1 ? (byPhone[0] ?? null) : null;
}

const linkAnswerSchema = z.object({
    success: z.boolean(),
    error: z.string().optional(),
});

/**
 * Ask link_prime_request to make the link. `shopId` is the store's pick when
 * Prime listed several. Answers connected, shared_account (another store uses
 * the account: our team decides), or a refusal the caller reports.
 */
export async function linkPrimeRequest(
    db: ServiceDb,
    requestId: string,
    shopId: number | null,
): Promise<"connected" | "shared_account" | "unknown_shop" | "not_open"> {
    const { data, error } = await db.rpc("link_prime_request", { _request_id: requestId, _shop_id: shopId });
    if (error) throw new Error(`link_prime_request failed: ${error.message}`);
    const answer = linkAnswerSchema.parse(data);
    if (answer.success) return "connected";
    if (answer.error === "shared_account" || answer.error === "unknown_shop") return answer.error;
    if (answer.error === "already_linked" || answer.error === "not_found") return "not_open";
    throw new Error(`link_prime_request refused: ${answer.error ?? "unknown"}`);
}

/**
 * Check one open request against Prime and keep what was found on it. Makes
 * the link when nothing stands in the way. Prime being down is an outcome, not
 * an error: the form stays, and the cron tries again.
 */
export async function checkPrimeLinkRequest(db: ServiceDb, client: PrimeClient, request: PrimeLinkRequestRow): Promise<PrimeLinkResult> {
    const save = async (fields: Record<string, unknown>) => {
        const { error } = await db
            .from("prime_link_requests")
            .update({ ...fields, checked_at: new Date().toISOString() })
            .eq("id", request.id)
            .is("linked_at", null);
        if (error) throw new Error(`prime_link_requests update failed: ${error.message}`);
    };

    let merchant: PrimeMerchantAccount | null;
    let shops: PrimeShopChoice[] = [];
    try {
        merchant = findPrimeMerchant(await client.merchants(), request.prime_phone);
        if (merchant) {
            shops = (await client.merchantShops(merchant.loginId))
                .filter((s) => s.active !== false)
                .map((s) => ({ id: s.id, name: s.name?.trim() || String(s.id) }));
        }
    } catch (err) {
        if (!isPrimeUnreachable(err)) throw err;
        await save({ outcome: "prime_down" });
        return { outcome: "prime_down" };
    }

    if (!merchant) {
        await save({ outcome: "not_linked", prime_login_id: null, prime_name: null, prime_shop_id: null, prime_shops: null });
        return { outcome: "not_linked" };
    }

    const { data: taken, error: takenError } = await db.rpc("prime_account_taken", {
        _tenant_id: request.tenant_id,
        _login: merchant.loginId,
    });
    if (takenError) throw new Error(`prime_account_taken failed: ${takenError.message}`);
    const only = shops.length === 1 ? (shops[0]?.id ?? null) : null;
    const outcome: PrimeLinkOutcome | null =
        taken === true ? "shared_account" : shops.length === 0 ? "no_shop" : shops.length > 1 ? "choose_shop" : null;
    await save({
        outcome,
        prime_login_id: merchant.loginId,
        prime_name: merchant.name?.trim() || null,
        prime_shop_id: only,
        prime_shops: shops,
    });
    if (outcome === "choose_shop") return { outcome, shops };
    if (outcome) return { outcome };

    const linked = await linkPrimeRequest(db, request.id, null);
    // A store that took the account a moment ago, or a request closed meanwhile.
    if (linked === "shared_account") return { outcome: "shared_account" };
    return { outcome: "connected" };
}

/** An open request waiting on Prime is looked at again this often. */
export const PRIME_LINK_RECHECK_MS = 10 * 60 * 1000;
/** Requests one cron run looks at; the rest wait for the next run. */
const RECHECK_BATCH = 10;

export type PrimeLinkRecheckOutcome = { checked: number; connected: number; failed: number };

/**
 * The prime-sync cron's part (every 5 minutes): look again at open requests
 * that wait on Prime (not_linked, no_shop, prime_down, or never checked) and
 * were last checked over 10 minutes ago, and link those Prime has caught up
 * on. Prime's merchant list is read once per run. One request failing does
 * not stop the others; `report` hears about it.
 */
export async function recheckPrimeLinkRequests(
    db: ServiceDb,
    client: PrimeClient,
    nowMs: number,
    report: (err: unknown, requestId: string) => void,
): Promise<PrimeLinkRecheckOutcome> {
    const before = new Date(nowMs - PRIME_LINK_RECHECK_MS).toISOString();
    const { data, error } = await db
        .from("prime_link_requests")
        .select("id, tenant_id, prime_phone")
        .is("linked_at", null)
        .or(`outcome.is.null,outcome.in.(${PRIME_LINK_RECHECKED.join(",")})`)
        .or(`checked_at.is.null,checked_at.lt.${before}`)
        .order("checked_at", { ascending: true, nullsFirst: true })
        .limit(RECHECK_BATCH);
    if (error) throw new Error(`prime_link_requests read failed: ${error.message}`);

    let merchants: Promise<PrimeMerchantAccount[]> | null = null;
    const once: PrimeClient = { ...client, merchants: () => (merchants ??= client.merchants()) };
    const outcome: PrimeLinkRecheckOutcome = { checked: 0, connected: 0, failed: 0 };
    for (const row of (data ?? []) as PrimeLinkRequestRow[]) {
        try {
            const result = await checkPrimeLinkRequest(db, once, row);
            outcome.checked += 1;
            if (result.outcome === "connected") outcome.connected += 1;
        } catch (err) {
            outcome.failed += 1;
            report(err, row.id);
        }
    }
    return outcome;
}
