// The admin app is LTR (CLAUDE.md): the root document sets `<html lang>` and
// never `<html dir>`. LTR is the HTML default, so leaving `dir` off is what
// keeps it LTR.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { Passthrough } = vi.hoisted(() => ({
  Passthrough: ({ children }: { children?: ReactNode }) => children,
}));

// Each next/font/local call becomes a face named after its file
// (`geist/latin`), plus `<name> Fallback` when it carries the size-adjusted
// fallback — the same shape `style.fontFamily` has in a real build.
vi.mock("next/font/local", () => ({
  default: (options: { src: string; adjustFontFallback?: false | string }) => {
    const name = options.src.replace(/^\.\//, "").replace(/\.woff2$/, "");
    return {
      style: {
        fontFamily: options.adjustFontFallback === false ? name : `${name}, ${name} Fallback`,
      },
    };
  },
}));
vi.mock("@/components/providers", () => ({ Providers: Passthrough }));

import RootLayout from "./layout";

const appRoot = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

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

  it("defines the Geist variables as their subset faces, then one fallback", () => {
    const body = renderToStaticMarkup(
      <RootLayout>
        <main>admin</main>
      </RootLayout>,
    ).match(/<body\b[^>]*>/)?.[0];
    expect(body).toContain(
      "--font-geist-sans:geist/latin, geist/latin-ext, geist/vietnamese, geist/cyrillic, geist/cyrillic-ext, geist/latin Fallback",
    );
    expect(body).toContain(
      "--font-geist-mono:geist-mono/latin, geist-mono/latin-ext, geist-mono/vietnamese, geist-mono/cyrillic, geist-mono/cyrillic-ext, geist-mono/latin Fallback",
    );
  });

  it("no source file loads fonts from Google at build time", () => {
    // next/font/google downloads every face during `next build`; one failed
    // fetch fails the build. Geist is committed under app/fonts and loaded
    // with next/font/local instead.
    const offenders = sourceFiles(appRoot)
      .filter((file) => /["']next\/font\/google["']/.test(readFileSync(file, "utf8")))
      .map((file) => relative(appRoot, file));
    expect(offenders).toEqual([]);
  });
});
