// isOptimizableImageHost must agree with the storefront's next.config.ts
// remotePatterns: a host it calls optimizable that Next refuses breaks the
// image (next/image throws in dev, /_next/image 400s in production), and a
// host Next allows that it refuses only costs the AVIF/WebP transcode.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isOptimizableImageHost } from "./image";

const NEXT_CONFIG = path.resolve(__dirname, "../../../../apps/storefront/next.config.ts");

/** Each remotePatterns entry as a sample URL it admits: `*.` → a subdomain, `/**` → a file. */
function remotePatternSamples(): string[] {
    const src = fs.readFileSync(NEXT_CONFIG, "utf8");
    const block = /remotePatterns:\s*\[([\s\S]*?)\n\s*\],/.exec(src);
    if (!block) throw new Error("next.config.ts has no images.remotePatterns");
    return [...block[1].matchAll(/\{([^{}]*)\}/g)].map(([, entry]) => {
        const host = /hostname:\s*"([^"]+)"/.exec(entry)?.[1];
        if (!host) throw new Error(`remotePatterns entry without a hostname: ${entry}`);
        const pathname = /pathname:\s*"([^"]+)"/.exec(entry)?.[1] ?? "/**";
        return `https://${host.replace(/^\*\./, "tenant.")}${pathname.replace(/\*\*$/, "a/b.jpg")}`;
    });
}

describe("isOptimizableImageHost", () => {
    it("allows every URL the storefront's remotePatterns allows", () => {
        const samples = remotePatternSamples();
        expect(samples.length).toBe(3);
        for (const url of samples) expect(isOptimizableImageHost(url), url).toBe(true);
    });

    it("refuses a path an allowed host's pattern does not cover", () => {
        expect(isOptimizableImageHost("https://i.ytimg.com/an_webp/x/mqdefault_6s.webp")).toBe(false);
        expect(isOptimizableImageHost("https://abc.supabase.co/storage/v1/object/sign/b/x.jpg")).toBe(false);
    });

    it("allows the YouTube thumbnail host the video facade uses", () => {
        expect(isOptimizableImageHost("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")).toBe(true);
    });

    it("refuses a merchant host Next is not configured for", () => {
        expect(isOptimizableImageHost("https://cdn.example.com/still.jpg")).toBe(false);
        expect(isOptimizableImageHost("")).toBe(false);
        expect(isOptimizableImageHost(null)).toBe(false);
    });
});
