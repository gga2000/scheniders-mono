import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-admin-auth", () => ({
  AdminAuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import { Providers } from "./providers";

describe("the console's providers", () => {
  it("give the theme's before-paint script the answer's nonce, so the script policy lets it run", () => {
    const scripts = renderToStaticMarkup(<Providers nonce="bm9uY2U=">admin</Providers>).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script).toContain('nonce="bm9uY2U="');
  });
});
