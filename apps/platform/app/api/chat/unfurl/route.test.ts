import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

// The guard decides per address; tests drive it to model a rebinding resolver.
const guard = vi.hoisted(() => ({ privateAfter: Infinity, calls: 0 }));
vi.mock("@/lib/chat/ssrf", () => ({
    isPrivateAddress: () => {
        guard.calls += 1;
        return guard.calls > guard.privateAfter;
    },
}));
vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: vi.fn(async () => ({ ok: true, userId: "u1", tenantId: "t1", role: "employee", platformAdmin: false })),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 })),
    rateLimitHeaders: () => ({}),
}));

import { GET } from "./route";
import { consumeRateLimit } from "@/lib/rate-limit";

let server: http.Server;
let base: string;
let hits = 0;

beforeAll(async () => {
    server = http.createServer((_req, res) => {
        hits += 1;
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><head><title>Hello page</title></head></html>");
    });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    // A name (not a literal IP) so the lookup path runs.
    base = `http://localhost.test-unfurl:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
beforeEach(() => {
    guard.calls = 0;
    guard.privateAfter = Infinity;
    hits = 0;
    vi.clearAllMocks();
});

vi.mock("node:dns", async (orig) => {
    const real = await orig<typeof import("node:dns")>();
    const answer = [{ address: "127.0.0.1", family: 4 }];
    const lookup = (_h: string, opts: unknown, cb: (...a: unknown[]) => void) => {
        const all = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
        if (all) cb(null, answer);
        else cb(null, "127.0.0.1", 4);
    };
    const mocked = { ...real, lookup, promises: { ...real.promises, lookup: async () => answer } };
    return { ...mocked, default: mocked };
});

const call = (url: string) =>
    GET({ nextUrl: new URL(`http://x/api/chat/unfurl?url=${encodeURIComponent(url)}`), headers: new Headers() } as never);

describe("GET /api/chat/unfurl", () => {
    it("fetches a page through the pinned connection", async () => {
        const res = await call(`${base}/a`);
        expect((await res.json()).title).toBe("Hello page");
        expect(hits).toBe(1);
        expect(consumeRateLimit).toHaveBeenCalledWith("chat-unfurl:t1", 60, 60);
    });

    it("refuses at connect time when the name rebinds to a private address after the check", async () => {
        guard.privateAfter = 1; // the pre-check sees public; the connect sees private
        const res = await call(`${base}/b`);
        expect((await res.json()).title).toBeNull();
        expect(hits).toBe(0);
    });
});
