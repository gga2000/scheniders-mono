/**
 * The store editor loads its preview at `/_preview/<slug>/<page>` on the
 * store's own origin. On a custom domain the proxy used to rewrite that under
 * `/s/__domain__<host>/_preview/...`, a path with no route, so the editor
 * showed the store's 404 page instead of the page being edited (verified on
 * www.scheniders.com, 2026-11-07).
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

function rewriteTargetFor(host: string, pathname: string): string | null {
    const req = new NextRequest(new URL(`https://${host}${pathname}`), {
        headers: { host },
    });
    const res = proxy(req);
    const target = res.headers.get("x-middleware-rewrite");
    return target ? new URL(target).pathname : null;
}

describe("editor preview route", () => {
    it("is not rewritten on a custom domain", () => {
        expect(
            rewriteTargetFor("www.shop.example.com", "/_preview/my-store/home"),
        ).toBeNull();
    });

    it("is not rewritten on a store subdomain", () => {
        expect(
            rewriteTargetFor("my-store.localhost:3001", "/_preview/my-store/home"),
        ).toBeNull();
    });

    it("does not swallow store pages that merely start with the same letters", () => {
        expect(rewriteTargetFor("www.shop.example.com", "/_previewer")).toBe(
            "/s/__domain__www.shop.example.com/_previewer",
        );
    });
});
