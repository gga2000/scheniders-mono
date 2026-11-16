// Customer profile end-to-end, against the real app with a real login.
//
//   E2E_EMAIL=… SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     E2E_BASE_URL=https://schenidersapp.xyz \
//     pnpm --filter @scheniders/platform exec playwright test e2e/customers.spec.ts --project=chromium
//
// Read-only. In the signed-in user's store it opens the profile of a number
// with no orders, a customer with one order, the customer with the most
// orders and a customer with a tag, and checks each one loads with the right
// number of order rows. Guards against the profile query failing as a whole,
// e.g. an ambiguous table link in one of its eight reads (on 8 Nov every
// profile showed "تعذّر تحميل بيانات العميل" that way). The customers are
// picked at run time, reading as the signed-in user, so no phone number is
// written here or named in a step. Skipped when a session cannot be minted.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { canMintSession, loginWithSession } from "./auth-session";

const EMAIL = process.env.E2E_EMAIL;
/** 0700 is no Iraqi operator's prefix, so no real customer has this number. */
const NO_ORDERS_PHONE = "07000000009";
/** The profile lists this many orders; the rest are a link to the orders page. */
const HISTORY_ROWS = 20;
const LOAD_FAILED = /تعذّر تحميل بيانات العميل|Couldn't load this customer/;

interface ProfileCase {
    label: string;
    phone: string;
}

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
}

/** A client that reads as the signed-in user, under the same row rules as the app. */
function readAs(accessToken: string): SupabaseClient {
    return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

/** The customers to open, from the store the user is working in. */
async function pickCases(db: SupabaseClient, userId: string): Promise<ProfileCase[]> {
    const profile = await db.from("user_profiles").select("current_tenant_id").eq("id", userId).single();
    if (profile.error || !profile.data.current_tenant_id) throw new Error("the e2e user has no active store");
    const store = profile.data.current_tenant_id;

    const [one, most, tagged] = await Promise.all([
        db.from("customer_aggregates").select("customer_phone")
            .eq("tenant_id", store).eq("total_orders", 1).limit(1).maybeSingle(),
        db.from("customer_aggregates").select("customer_phone")
            .eq("tenant_id", store).gt("total_orders", 1).order("total_orders", { ascending: false }).limit(1).maybeSingle(),
        db.from("customer_tag_assignments").select("customer_phone")
            .eq("tenant_id", store).limit(1).maybeSingle(),
    ]);
    for (const res of [one, most, tagged]) {
        if (res.error) throw new Error(`picking customers failed: ${res.error.message}`);
    }

    const cases: ProfileCase[] = [{ label: "no orders", phone: NO_ORDERS_PHONE }];
    const found: [string, { customer_phone: string | null } | null][] = [
        ["one order", one.data],
        ["most orders", most.data],
        ["with a tag", tagged.data],
    ];
    for (const [label, row] of found) {
        if (row?.customer_phone) cases.push({ label, phone: row.customer_phone });
        else test.info().annotations.push({ type: "skipped case", description: `the store has no customer ${label}` });
    }
    return cases;
}

/** How many orders the profile's history read returns for this number. */
async function historyCount(db: SupabaseClient, phone: string): Promise<number> {
    const { count, error } = await db.rpc("get_customer_order_history", { p_phone: phone }, { count: "exact", head: true });
    if (error || count === null) throw new Error(`counting orders failed: ${error?.message ?? "no count"}`);
    return count;
}

test.skip(!canMintSession(EMAIL), "E2E_EMAIL or the session-minting variables are not set");
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

test.describe("Customer profile", () => {
    test("opens for customers with no, one and many orders, with and without tags", async ({ page }) => {
        const session = await loginWithSession(page, EMAIL ?? "", "/customers");
        const db = readAs(session.accessToken);
        const cases = await pickCases(db, session.userId);

        for (const profileCase of cases) {
            await test.step(profileCase.label, async () => {
                const orders = await historyCount(db, profileCase.phone);
                if (profileCase.label === "no orders") expect(orders, "the no-orders number has orders").toBe(0);

                await page.goto(`/customers/${encodeURIComponent(profileCase.phone)}`);
                await expect(page.locator(".customer-profile")).toBeVisible({ timeout: 60_000 });
                await expect(page.getByText(LOAD_FAILED)).toHaveCount(0);
                if (orders === 0) {
                    await expect(page.getByTestId("customer-history-empty")).toBeVisible();
                } else {
                    await expect(page.getByTestId("customer-history-row")).toHaveCount(Math.min(orders, HISTORY_ROWS));
                }
            });
        }
    });
});
