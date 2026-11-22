import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { gzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";

// The test server is on 127.0.0.1; the guard treats only 10.x as private, so
// "public.test" (127.0.0.1) may be fetched and "inside.test" (10.0.0.1) not.
vi.mock("./ssrf", () => ({ isPrivateAddress: (ip: string) => ip.startsWith("10.") }));
vi.mock("node:dns", async (orig) => {
    const real = await orig<typeof import("node:dns")>();
    const answer = (host: string) => [{ address: host.startsWith("inside") ? "10.0.0.1" : "127.0.0.1", family: 4 }];
    const lookup = (host: string, opts: unknown, cb: (...a: unknown[]) => void) => {
        const all = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
        if (all) cb(null, answer(host));
        else cb(null, answer(host)[0].address, 4);
    };
    const mocked = { ...real, lookup, promises: { ...real.promises, lookup: async (host: string) => answer(host) } };
    return { ...mocked, default: mocked };
});

import { fetchPublic, readCapped, validatePublicUrl } from "./public-fetch";

let server: http.Server;
let port = 0;
let hits: string[] = [];

beforeAll(async () => {
    server = http.createServer((req, res) => {
        hits.push(req.url ?? "");
        if (req.url === "/hop") {
            res.writeHead(302, { location: "/img" });
            res.end();
        } else if (req.url === "/inside") {
            res.writeHead(302, { location: `http://inside.test:${port}/img` });
            res.end();
        } else if (req.url === "/stall" || req.url === "/stall-gzip") {
            // Headers and the first bytes of the body, then nothing more.
            const gzip = req.url === "/stall-gzip";
            res.writeHead(200, { "content-type": "image/png", ...(gzip ? { "content-encoding": "gzip" } : {}) });
            res.write(gzip ? gzipSync(Buffer.alloc(100_000, 7)).subarray(0, 40) : Buffer.alloc(40, 7));
        } else if (req.url === "/loop") {
            res.writeHead(302, { location: "/loop" });
            res.end();
        } else {
            res.writeHead(200, { "content-type": "image/png" });
            res.end(Buffer.alloc(1000, 7));
        }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
});
afterAll(
    () =>
        new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
        }),
);
beforeEach(() => {
    hits = [];
});

const opts = () => ({ signal: AbortSignal.timeout(5000), headers: { accept: "image/*" }, maxRedirects: 2 });

describe("validatePublicUrl", () => {
    it("takes public web links only", async () => {
        expect(await validatePublicUrl(`http://public.test:${port}/a`)).not.toBeNull();
        expect(await validatePublicUrl(`http://inside.test:${port}/a`)).toBeNull();
        expect(await validatePublicUrl("http://10.1.2.3/a")).toBeNull();
        expect(await validatePublicUrl("http://localhost/a")).toBeNull();
        expect(await validatePublicUrl("ftp://public.test/a")).toBeNull();
        expect(await validatePublicUrl("https://user:pw@public.test/a")).toBeNull();
        expect(await validatePublicUrl("not a link")).toBeNull();
    });
});

describe("fetchPublic", () => {
    it("follows a redirect it has checked", async () => {
        const got = await fetchPublic(new URL(`http://public.test:${port}/hop`), opts());
        expect(got?.res.status).toBe(200);
        expect(got?.url.pathname).toBe("/img");
        expect(hits).toEqual(["/hop", "/img"]);
        await got?.res.body?.cancel();
    });

    it("never follows a redirect into a private address", async () => {
        expect(await fetchPublic(new URL(`http://public.test:${port}/inside`), opts())).toBeNull();
        expect(hits).toEqual(["/inside"]);
    });

    it("gives up after the redirects it may follow", async () => {
        expect(await fetchPublic(new URL(`http://public.test:${port}/loop`), opts())).toBeNull();
        expect(hits).toHaveLength(3);
    });

    it("refuses at connect time a name that resolves private", async () => {
        expect(await fetchPublic(new URL(`http://inside.test:${port}/img`), opts())).toBeNull();
        expect(hits).toEqual([]);
    });
});

describe("readCapped", () => {
    it("cuts or refuses a body past the cap", async () => {
        const read = async (past: "cut" | "refuse", cap: number) => {
            const got = await fetchPublic(new URL(`http://public.test:${port}/img`), opts());
            if (!got) throw new Error("no answer");
            return readCapped(got.res, cap, past);
        };
        expect(await read("refuse", 999)).toBe("too_big");
        const cut = await read("cut", 10);
        expect(cut instanceof Uint8Array ? cut.length : cut).toBe(10);
        const whole = await read("refuse", 1000);
        expect(whole instanceof Uint8Array ? whole.length : whole).toBe(1000);
    });
});

// Round 18: the signal stopped a plain answer that stalled, but a gzip one
// kept the read waiting 28 s past it (the decoder was piped, not pipelined).
describe("a body that stalls", () => {
    it.each(["/stall", "/stall-gzip"])("%s stops when the signal ends", async (path) => {
        const signal = AbortSignal.timeout(200);
        const got = await fetchPublic(new URL(`http://public.test:${port}${path}`), { ...opts(), signal });
        if (!got) throw new Error("no answer");
        const started = Date.now();
        expect(await readCapped(got.res, 1_000_000, "refuse")).toBeNull();
        expect(Date.now() - started).toBeLessThan(1500);
    });
});
