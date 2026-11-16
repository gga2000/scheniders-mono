import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeLink } from "@/lib/prime/connection";
import { normalizeIraqiPhone } from "@/lib/order-utils";
import { withFailureReport } from "@/lib/job-monitor";
import { checkPrimeLinkRequest, linkPrimeRequest, type PrimeShopChoice } from "@/lib/prime/self-link";
import { PRIME_LINK_OUTCOMES, type PrimeLinkOutcome } from "@/lib/prime/link-outcomes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const IRAQI_MOBILE = /^07\d{9}$/;
/** Checks a store may start: each one is two Prime calls. */
const CHECK_LIMIT = 6;
const CHECK_WINDOW_SECONDS = 60;

const bodySchema = z.union([
    z.object({ phone: z.string().min(1).max(32) }),
    z.object({ shopId: z.number().int().positive() }),
    z.object({ recheck: z.literal(true) }),
]);

const shopsSchema = z.array(z.object({ id: z.number().int().positive(), name: z.string() }));

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

type OpenRequest = {
    id: string;
    tenant_id: string;
    prime_phone: string;
    created_at: string;
    checked_at: string | null;
    outcome: PrimeLinkOutcome | null;
    prime_shops: unknown;
};

/** What the Prime page shows: the link, or the store's open request and why it waits. */
type LinkState = {
    success: true;
    connected: boolean;
    request: { phone: string; outcome: PrimeLinkOutcome | null; checkedAt: string | null; shops?: PrimeShopChoice[] } | null;
};

async function openRequest(db: ServiceDb, tenantId: string): Promise<OpenRequest | null> {
    const { data, error } = await db
        .from("prime_link_requests")
        .select("id, tenant_id, prime_phone, created_at, checked_at, outcome, prime_shops")
        .eq("tenant_id", tenantId)
        .is("linked_at", null)
        .maybeSingle();
    if (error) throw new Error(`prime_link_requests read failed: ${error.message}`);
    if (!data) return null;
    const outcome = PRIME_LINK_OUTCOMES.find((o) => o === data.outcome) ?? null;
    return { ...(data as Omit<OpenRequest, "outcome">), outcome };
}

async function stateOf(db: ServiceDb, tenantId: string): Promise<LinkState> {
    if (await loadPrimeLink(db, tenantId)) return { success: true, connected: true, request: null };
    const open = await openRequest(db, tenantId);
    if (!open) return { success: true, connected: false, request: null };
    // The shops of an account are shown only while the store is choosing one of its own.
    const shops = open.outcome === "choose_shop" ? shopsSchema.safeParse(open.prime_shops) : null;
    return {
        success: true,
        connected: false,
        request: {
            phone: open.prime_phone,
            outcome: open.outcome,
            checkedAt: open.checked_at,
            ...(shops?.success ? { shops: shops.data } : {}),
        },
    };
}

/**
 * GET /api/prime/link — the store's Prime link as the Prime page shows it:
 * connected, or the open request and why it waits. Store admins only.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;
    return NextResponse.json(await stateOf(createSupabaseServiceClient(), caller.tenantId));
}

/**
 * POST /api/prime/link — a store links its own Prime account (Fermi A3).
 *
 * - `{ phone }`: the phone of the store's Prime account. Saved as the store's
 *   request (one open request per store; a new number replaces the old one),
 *   then checked with Prime at once.
 * - `{ shopId }`: the shop the store picked when Prime listed several.
 * - `{ recheck: true }`: look at Prime again now.
 *
 * Answers the same state as GET. A number that is not an Iraqi mobile is
 * refused with an Arabic message and nothing is saved. Prime not answering is
 * not a failure: the request waits as prime_down and the cron tries again.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
    const body = parsed.data;

    let phone: string | null = null;
    if ("phone" in body) {
        phone = normalizeIraqiPhone(body.phone);
        if (!IRAQI_MOBILE.test(phone)) {
            return NextResponse.json(
                { success: false, code: "bad_phone", error: "اكتب رقم موبايل عراقي، مثل 07801234567." },
                { status: 400 },
            );
        }
    }

    const limit = await consumeRateLimit(`prime-link:${caller.tenantId}`, CHECK_LIMIT, CHECK_WINDOW_SECONDS);
    if (!limit.allowed) {
        return NextResponse.json(
            { success: false, error: "حاولت هواية مرات. انتظر دقيقة وحاول مرة ثانية." },
            { status: 429, headers: rateLimitHeaders(limit, CHECK_LIMIT) },
        );
    }

    const db = createSupabaseServiceClient();
    if (await loadPrimeLink(db, caller.tenantId)) return NextResponse.json(await stateOf(db, caller.tenantId));
    let open = await openRequest(db, caller.tenantId);

    if ("shopId" in body) {
        if (!open || open.outcome !== "choose_shop") {
            return NextResponse.json({ success: false, error: "No shop to choose" }, { status: 409 });
        }
        const linked = await linkPrimeRequest(db, open.id, body.shopId);
        if (linked === "unknown_shop") return NextResponse.json({ success: false, error: "Unknown shop" }, { status: 400 });
        return NextResponse.json(await stateOf(db, caller.tenantId));
    }

    if (phone) {
        const fresh = {
            prime_phone: phone,
            requested_by: caller.userId,
            outcome: null,
            checked_at: null,
            prime_login_id: null,
            prime_name: null,
            prime_shop_id: null,
            prime_shops: null,
        };
        const write = open
            ? db.from("prime_link_requests").update(fresh).eq("id", open.id).is("linked_at", null)
            : db.from("prime_link_requests").insert({ tenant_id: caller.tenantId, ...fresh });
        const { error } = await write;
        // 23505: the store's other tab saved a request a moment ago; check that one.
        if (error && error.code !== "23505") throw new Error(`prime_link_requests write failed: ${error.message}`);
        open = await openRequest(db, caller.tenantId);
    }
    if (!open) return NextResponse.json({ success: false, error: "No request to check" }, { status: 409 });

    const client = getPrimeClient();
    if (client) await checkPrimeLinkRequest(db, client, open);
    return NextResponse.json(await stateOf(db, caller.tenantId));
}

export const GET = withFailureReport("api/prime/link GET", handleGET);
export const POST = withFailureReport("api/prime/link POST", handlePOST);
