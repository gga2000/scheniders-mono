import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOT_SCRIPT } from "./script";
import { BOOT_GLOBAL, BootRequestSchema } from "./schema";

/** Run the head script as the browser would, on `url`, with `fetch` answering `answer`. */
async function run(url: string, answer: () => Promise<Response>, storage: Record<string, string> = {}) {
    const requested: string[] = [];
    const location = new URL(url);
    const window: Record<string, unknown> = {};
    const fetch = vi.fn((input: string) => {
        requested.push(input);
        return answer();
    });
    const localStorage = { getItem: (k: string) => storage[k] ?? null };
    new Function("window", "location", "fetch", "localStorage", BOOT_SCRIPT)(window, location, fetch, localStorage);
    const pending = window[BOOT_GLOBAL] as Promise<{ status: number; body: unknown }> | undefined;
    return { requested, result: pending ? await pending : undefined };
}

const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
const query = (requested: string) => BootRequestSchema.parse(Object.fromEntries(new URL(requested, "https://x").searchParams));

afterEach(() => vi.restoreAllMocks());

describe("the first-load head script", () => {
    it("asks for the page it is on, with the dashboard's period from the link", async () => {
        const { requested, result } = await run("https://app.example/dashboard?range=30d", json({ ok: 1 }));
        expect(requested).toHaveLength(1);
        expect(query(requested[0])).toEqual({ path: "/dashboard", range: "30d" });
        expect(result).toMatchObject({ status: 200, body: { ok: 1 } });
    });

    it("sends Finances' period kept in this browser", async () => {
        const kept = JSON.stringify({ preset: "mtd", compareMode: "none" });
        const { requested } = await run("https://app.example/finances", json({}), { "finance.period.v1": kept });
        expect(query(requested[0])).toEqual({ path: "/finances", financePeriod: kept });
    });

    it("asks nothing on the sign-in pages", async () => {
        for (const page of ["/login", "/signup", "/forgot-password", "/reset-password", "/join/abc", "/landing", "/offline"]) {
            const { requested, result } = await run(`https://app.example${page}`, json({}));
            expect(requested).toEqual([]);
            expect(result).toBeUndefined();
        }
    });

    it("resolves a refused or failed request to a status, never a rejection", async () => {
        expect((await run("https://app.example/orders", json({ error: "x" }, 401))).result).toMatchObject({ status: 401, body: null });
        expect((await run("https://app.example/orders", () => Promise.reject(new TypeError("offline")))).result).toMatchObject({ status: 0, body: null });
    });
});
