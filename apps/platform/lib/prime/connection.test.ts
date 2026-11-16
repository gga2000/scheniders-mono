import { beforeEach, describe, expect, it, vi } from "vitest";

const realClient = { real: true };
const env = { configured: true };
vi.mock("@/lib/prime/client", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/prime/client")>()),
    getPrimeClient: () => (env.configured ? realClient : null),
}));

const { loadPrimeLink } = await import("@/lib/prime/connection");
const { DEMO_PRIME_CONNECTION } = await import("@/lib/prime/demo-client");

type Answer = { data: unknown; error: null };
let answers: Record<string, Answer>;

const db = {
    from: (table: string) => {
        const q = {
            select: () => q,
            eq: () => q,
            maybeSingle: async () => answers[table] ?? { data: null, error: null },
        };
        return q;
    },
} as unknown as Parameters<typeof loadPrimeLink>[0];

const TENANT = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
    env.configured = true;
    answers = {};
});

describe("loadPrimeLink", () => {
    it("links a store with a switched-on connection through the real client", async () => {
        answers.prime_connections = { data: { merchant_login_id: "m1", shop_id: "48522", branch_name: " فرع الكوت " }, error: null };
        const link = await loadPrimeLink(db, TENANT);
        expect(link?.client).toBe(realClient);
        expect(link?.connection).toEqual({ merchantLoginId: "m1", shopId: 48522, branchName: "فرع الكوت" });
    });

    it("links the demo store through the demo client, with no connection row and no Prime settings", async () => {
        env.configured = false;
        answers.tenants = { data: { is_demo: true }, error: null };
        const link = await loadPrimeLink(db, TENANT);
        expect(link?.client).not.toBe(realClient);
        expect(link?.connection).toEqual(DEMO_PRIME_CONNECTION);
        expect(await link?.client.shipmentCharge("fermi-demo", "BGD", 1000)).toBe(5000);
    });

    it("leaves a store without a connection unlinked", async () => {
        answers.tenants = { data: { is_demo: false }, error: null };
        expect(await loadPrimeLink(db, TENANT)).toBeNull();
    });
});
