/**
 * A store on its own domain must reach its own per-tenant documents.
 *
 * The proxy recognises a static asset by the dot in its path and passes it
 * through untouched. Two real routes also carry an extension, and passing
 * those through sent them to the platform root, which has no such route —
 * so `/manifest.webmanifest` returned 404 on a live custom-domain store,
 * verified against production before this was fixed. The route handler was
 * correct the whole time; nothing ever routed to it.
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/** Where the proxy decided to send this request, or null when it passed through. */
function rewriteTargetFor(host: string, pathname: string): string | null {
    const req = new NextRequest(new URL(`https://${host}${pathname}`), {
        headers: { host },
    });
    const res = proxy(req);
    const target = res.headers.get("x-middleware-rewrite");
    return target ? new URL(target).pathname : null;
}

const STORE = "shop.example.com";

describe("per-tenant documents on a store's own domain", () => {
    it.each(["/manifest.webmanifest", "/sitemap.xml"])(
        "routes %s to the tenant's own route",
        (path) => {
            expect(rewriteTargetFor(STORE, path)).toBe(
                `/s/__domain__${STORE}${path}`,
            );
        },
    );

    it("still routes ordinary store pages", () => {
        expect(rewriteTargetFor(STORE, "/products")).toBe(
            `/s/__domain__${STORE}/products`,
        );
    });
});

describe("path-based stores are unaffected", () => {
    it("leaves an already-prefixed document alone", () => {
        // `/s/<tenant>/sitemap.xml` already names its tenant, so there is
        // nothing to rewrite. `getStorefrontBase` falls back to `/s/<tenant>`
        // when the proxy sends no `x-store-base`, which is the right base for
        // path mode — this is how the manifest has always worked there.
        expect(rewriteTargetFor("localhost", "/s/my-store/sitemap.xml")).toBeNull();
        expect(
            rewriteTargetFor("localhost", "/s/my-store/manifest.webmanifest"),
        ).toBeNull();
    });
});

describe("static assets keep passing straight through", () => {
    it.each([
        "/logo.png",
        "/fonts/body.woff2",
        "/favicon.ico",
        "/some.file.with.dots.jpg",
    ])("does not rewrite %s", (path) => {
        // Rewriting these onto /s/<tenant>/ would break every static file a
        // store serves, which is why the dot test exists in the first place.
        expect(rewriteTargetFor(STORE, path)).toBeNull();
    });
});
