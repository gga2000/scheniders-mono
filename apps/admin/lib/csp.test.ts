import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { newNonce, scriptPolicy } from "./csp";

/** The nonce form Next.js reads from the request's policy (get-script-nonce-from-header). */
const NEXT_NONCE = /^[A-Za-z0-9+/_-]+={0,2}$/;

describe("the console's script policy", () => {
  it("makes a new 16-byte nonce each time, in the form Next.js reads", () => {
    const nonces = new Set(Array.from({ length: 50 }, newNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(NEXT_NONCE);
      expect(atob(nonce)).toHaveLength(16);
    }
  });

  it("lets only the nonce's scripts and what they load run, and closes the other ways in", () => {
    const policy = scriptPolicy("abc=");
    expect(policy.split("; ")).toEqual([
      "script-src 'self' 'nonce-abc=' 'strict-dynamic'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]);
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    expect(scriptPolicy("abc=", true)).toContain("'unsafe-eval'");
  });

  it("is the console's only policy: next.config sends none, so Next.js finds the nonce", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const names = rules.flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()));
    expect(names).toContain("x-frame-options");
    expect(names.filter((name) => name.startsWith("content-security-policy"))).toEqual([]);
  });
});
