import { describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { PrimeApiError, type PrimeClient, type PrimeMerchantAccount, type PrimeMerchantShop } from "./client";
import { randomBytes } from "node:crypto";
import { checkPrimeLinkRequest, createPrimeMerchantForRequest, findPrimeMerchant, primeMerchantKey, recheckPrimeLinkRequests } from "./self-link";
import { sealPrimePassword } from "./login-seal";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

const TENANT = "11111111-1111-4111-8111-111111111111";
const REQUEST = { id: "req-1", tenant_id: TENANT, prime_phone: "07701234567" };

function prime(merchants: PrimeMerchantAccount[] | Error, shops: PrimeMerchantShop[] = []) {
    const client = {
        merchants: vi.fn(async () => {
            if (merchants instanceof Error) throw merchants;
            return merchants;
        }),
        merchantShops: vi.fn(async () => shops),
    };
    return { client: client as unknown as PrimeClient, ...client };
}

function db(options: { taken?: boolean; link?: FakeResult; respond?: (call: FakeCall) => FakeResult } = {}) {
    const fake = fakeServiceClient(options.respond ?? (() => ({})), {
        rpc: (name) => {
            if (name === "prime_account_taken") return { data: options.taken ?? false };
            if (name === "link_prime_request") return options.link ?? { data: { success: true } };
            return {};
        },
    });
    return { ...fake, db: fake.client as unknown as ServiceDb };
}

const saved = (calls: FakeCall[]) => calls.find((c) => c.table === "prime_link_requests" && c.op === "update")?.payload as Record<string, unknown>;

describe("primeMerchantKey", () => {
    it.each([
        ["07701234567", "07701234567"],
        ["+964 770 123 4567", "07701234567"],
        ["9647701234567", "07701234567"],
        ["009647701234567", "07701234567"],
        ["7701234567", "07701234567"],
        [" AA10002000 ", "aa10002000"],
    ])("%s → %s (the same as the database's prime_merchant_key)", (login, key) => {
        expect(primeMerchantKey(login)).toBe(key);
    });
});

describe("findPrimeMerchant", () => {
    const list = [
        { loginId: "aa10002000", phone1: "07701234567", active: true },
        { loginId: "07701234567", phone1: "07800000000", active: true },
        { loginId: "bb", phone1: "07709999999", active: true },
        { loginId: "cc", phone1: "07709999999", active: true },
        { loginId: "07711111111", active: false },
    ];

    it("a login match wins over a phone match", () => {
        expect(findPrimeMerchant(list, "+9647701234567")?.loginId).toBe("07701234567");
    });

    it("finds an account by its phone when the login is a name", () => {
        expect(findPrimeMerchant(list.slice(0, 1), "07701234567")?.loginId).toBe("aa10002000");
    });

    it("picks nobody when one phone sits on two accounts, or the account is inactive", () => {
        expect(findPrimeMerchant(list, "07709999999")).toBeNull();
        expect(findPrimeMerchant(list, "07711111111")).toBeNull();
        expect(findPrimeMerchant(list, "07722222222")).toBeNull();
    });
});

describe("checkPrimeLinkRequest", () => {
    it("one shop, an account nobody else uses: links at once", async () => {
        const p = prime([{ loginId: "07701234567", name: "متجر سارة", active: true }], [{ id: 5510, name: "Main", active: true }]);
        const d = db();
        expect(await checkPrimeLinkRequest(d.db, p.client, REQUEST)).toEqual({ outcome: "connected" });
        expect(p.merchantShops).toHaveBeenCalledWith("07701234567");
        expect(saved(d.calls)).toMatchObject({
            outcome: null,
            prime_login_id: "07701234567",
            prime_name: "متجر سارة",
            prime_shop_id: 5510,
            prime_shops: [{ id: 5510, name: "Main" }],
        });
        expect(d.rpcCalls).toEqual([
            { name: "prime_account_taken", args: { _tenant_id: TENANT, _login: "07701234567" } },
            { name: "link_prime_request", args: { _request_id: "req-1", _shop_id: null } },
        ]);
    });

    it("Prime has not linked the account to us: waits as not_linked, nothing linked", async () => {
        const d = db();
        expect(await checkPrimeLinkRequest(d.db, prime([]).client, REQUEST)).toEqual({ outcome: "not_linked" });
        expect(saved(d.calls)).toMatchObject({ outcome: "not_linked", prime_login_id: null, prime_shops: null });
        expect(d.rpcCalls).toEqual([]);
    });

    it("an account another store uses waits for our team, and its shops are not shown", async () => {
        const p = prime([{ loginId: "07701234567", active: true }], [{ id: 1, name: "A" }, { id: 2, name: "B" }]);
        const d = db({ taken: true });
        expect(await checkPrimeLinkRequest(d.db, p.client, REQUEST)).toEqual({ outcome: "shared_account" });
        expect(saved(d.calls)).toMatchObject({ outcome: "shared_account", prime_login_id: "07701234567" });
        expect(d.rpcCalls.map((c) => c.name)).toEqual(["prime_account_taken"]);
    });

    it("several active shops: the store picks one", async () => {
        const p = prime(
            [{ loginId: "07701234567", active: true }],
            [{ id: 1, name: "Main" }, { id: 2, name: " " }, { id: 3, name: "Closed", active: false }],
        );
        const d = db();
        expect(await checkPrimeLinkRequest(d.db, p.client, REQUEST)).toEqual({
            outcome: "choose_shop",
            shops: [{ id: 1, name: "Main" }, { id: 2, name: "2" }],
        });
        expect(saved(d.calls)).toMatchObject({ outcome: "choose_shop", prime_shop_id: null });
    });

    it("no active shop: waits as no_shop", async () => {
        const p = prime([{ loginId: "07701234567", active: true }], [{ id: 1, name: "Closed", active: false }]);
        expect(await checkPrimeLinkRequest(db().db, p.client, REQUEST)).toEqual({ outcome: "no_shop" });
    });

    it("Prime not answering is an outcome, kept for the next try", async () => {
        const d = db();
        const p = prime(new PrimeApiError("down", 503));
        expect(await checkPrimeLinkRequest(d.db, p.client, REQUEST)).toEqual({ outcome: "prime_down" });
        expect(saved(d.calls)).toEqual({ outcome: "prime_down", checked_at: expect.any(String) });
    });

    it("a store that took the account a moment ago turns the link into a wait", async () => {
        const p = prime([{ loginId: "07701234567", active: true }], [{ id: 5510, name: "Main" }]);
        const d = db({ link: { data: { success: false, error: "shared_account" } } });
        expect(await checkPrimeLinkRequest(d.db, p.client, REQUEST)).toEqual({ outcome: "shared_account" });
    });

    it("only an open request is written", async () => {
        const d = db();
        await checkPrimeLinkRequest(d.db, prime([]).client, REQUEST);
        const write = d.calls.find((c) => c.op === "update");
        expect(write?.filters).toEqual(
            expect.arrayContaining([
                { method: "eq", args: ["id", "req-1"] },
                { method: "is", args: ["linked_at", null] },
            ]),
        );
    });
});

describe("recheckPrimeLinkRequests", () => {
    it("reads Prime's merchant list once per run, and one failure does not stop the rest", async () => {
        const rows = [REQUEST, { ...REQUEST, id: "req-2", prime_phone: "07800000000" }, { ...REQUEST, id: "req-3", prime_phone: "07811111111" }];
        const p = prime([{ loginId: "07800000000", active: true }], [{ id: 9, name: "Main" }]);
        let writes = 0;
        const d = db({
            respond: (call) => {
                if (call.op === "select") return { data: rows };
                writes += 1;
                // The second write (req-2's) fails.
                return writes === 2 ? { error: { message: "boom" } } : {};
            },
        });
        const report = vi.fn();
        const outcome = await recheckPrimeLinkRequests(d.db, p.client, Date.parse("2026-11-16T12:00:00Z"), report);
        expect(outcome).toEqual({ checked: 2, connected: 0, failed: 1 });
        expect(report).toHaveBeenCalledWith(expect.any(Error), "req-2");
        expect(p.merchants).toHaveBeenCalledTimes(1);
        const read = d.calls[0];
        expect(read?.filters).toEqual(
            expect.arrayContaining([
                { method: "is", args: ["linked_at", null] },
                { method: "or", args: ["outcome.is.null,outcome.in.(not_linked,no_shop,prime_down)"] },
                { method: "or", args: ["checked_at.is.null,checked_at.lt.2026-11-16T11:50:00.000Z"] },
            ]),
        );
    });
});

describe("createPrimeMerchantForRequest", () => {
    const KEY = randomBytes(32);
    const NEW = { ...REQUEST, new_name: "متجر سارة", new_state: "BGD", new_login_id: "sara_shop", new_shop_name: "متجر سارة" };
    const savedLogin = { login_id: "sara_shop", password_sealed: sealPrimePassword("pass-1234", TENANT, KEY) };

    function newPrime(options: { listedAfter?: boolean; create?: Error } = {}) {
        let created = false;
        const client = {
            merchants: vi.fn(async () => (created || options.listedAfter ? [{ loginId: "sara_shop", active: true }] : [])),
            merchantShops: vi.fn(async () => [{ id: 7001, name: "متجر سارة", active: true }]),
            createMerchant: vi.fn(async () => {
                if (options.create) throw options.create;
                created = true;
                return "sara_shop";
            }),
        };
        return { client: client as unknown as PrimeClient, ...client };
    }
    const newDb = () => db({ respond: (call) => (call.table === "prime_saved_logins" ? { data: savedLogin } : {}) });

    it("creates the account with the saved password, then links the store", async () => {
        const p = newPrime();
        const d = newDb();
        expect(await createPrimeMerchantForRequest(d.db, p.client, NEW, KEY)).toEqual({ outcome: "connected" });
        expect(p.createMerchant).toHaveBeenCalledWith({
            name: "متجر سارة",
            loginId: "sara_shop",
            password: "pass-1234",
            phone: "07701234567",
            state: "BGD",
            shopName: "متجر سارة",
        });
        expect(d.rpcCalls.map((c) => c.name)).toContain("link_prime_request");
    });

    it("an account Prime already lists (an earlier try) is linked, not created twice", async () => {
        const p = newPrime({ listedAfter: true });
        expect(await createPrimeMerchantForRequest(newDb().db, p.client, NEW, KEY)).toEqual({ outcome: "connected" });
        expect(p.createMerchant).not.toHaveBeenCalled();
    });

    it("a login Prime refuses as taken waits on the store", async () => {
        const p = newPrime({ create: new PrimeApiError("Login id already used", 422, 1006) });
        const d = newDb();
        expect(await createPrimeMerchantForRequest(d.db, p.client, NEW, KEY)).toEqual({ outcome: "login_taken" });
        expect(saved(d.calls)).toMatchObject({ outcome: "login_taken" });
    });

    it("any other refusal waits on our team and is reported", async () => {
        const p = newPrime({ create: new PrimeApiError("Phone number is blank", 400, 8034) });
        const d = newDb();
        await expect(createPrimeMerchantForRequest(d.db, p.client, NEW, KEY)).rejects.toThrow("Phone number is blank");
        expect(saved(d.calls)).toMatchObject({ outcome: "create_failed" });
    });

    it("Prime down waits for the next run", async () => {
        const p = newPrime({ create: new PrimeApiError("Bad gateway", 502) });
        const d = newDb();
        expect(await createPrimeMerchantForRequest(d.db, p.client, NEW, KEY)).toEqual({ outcome: "prime_down" });
    });

    it("never creates without the sealing key", async () => {
        const p = newPrime();
        await expect(createPrimeMerchantForRequest(newDb().db, p.client, NEW, null)).rejects.toThrow("PRIME_LOGIN_KEY");
        expect(p.createMerchant).not.toHaveBeenCalled();
    });
});
