// The admin app is LTR (CLAUDE.md): the root document sets `<html lang>` and
// never `<html dir>`. LTR is the HTML default, so leaving `dir` off is what
// keeps it LTR.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { Passthrough } = vi.hoisted(() => ({
  Passthrough: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));
vi.mock("@/components/providers", () => ({ Providers: Passthrough }));

import RootLayout from "./layout";

describe("admin root document", () => {
  it("root layout sets <html lang> and no dir", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>admin</main>
      </RootLayout>,
    );
    const tag = markup.match(/<html\b[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).toMatch(/\slang="en"/);
    expect(tag).not.toMatch(/\sdir=/);
  });
});
