// The storefront is LTR in every locale, Arabic included (CLAUDE.md): the root
// document sets `<html lang>` (HtmlLang later corrects it per tenant) and never
// `<html dir>`. LTR is the HTML default, so leaving `dir` off keeps every
// store LTR.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

interface LocalFontCall {
  src: { path: string }[];
  adjustFontFallback?: false | string;
  declarations?: { prop: string; value: string }[];
}

const { fontCalls } = vi.hoisted(() => ({ fontCalls: [] as LocalFontCall[] }));

// Each next/font/local call becomes a face named after its first file
// (`cairo/latin`), plus `<name> Fallback` when it carries the size-adjusted
// fallback — the same shape `style.fontFamily` has in a real build.
vi.mock("next/font/local", () => ({
  default: (options: LocalFontCall) => {
    fontCalls.push(options);
    const name = options.src[0].path.replace(/^\.\//, "").replace(/\.woff2$/, "");
    return {
      style: {
        fontFamily: options.adjustFontFallback === false ? name : `${name}, ${name} Fallback`,
      },
    };
  },
}));

import RootLayout from "./layout";

const appRoot = join(__dirname, "..");
const fontsDir = join(__dirname, "fonts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

function renderHtmlTag(): string {
  const markup = renderToStaticMarkup(
    <RootLayout>
      <main>store</main>
    </RootLayout>,
  );
  const tag = markup.match(/<html\b[^>]*>/)?.[0];
  expect(tag).toBeDefined();
  return tag ?? "";
}

describe("storefront root document", () => {
  it("root layout sets <html lang> and no dir", () => {
    const tag = renderHtmlTag();
    expect(tag).toMatch(/\slang="ar"/);
    expect(tag).not.toMatch(/\sdir=/);
  });

  it("defines each brand font variable as its subset faces, then one fallback", () => {
    // Faces in the order Google's own CSS resolves overlapping ranges (its
    // last-declared face wins; in a stack the first does), with the Arabic
    // face after the Latin ones and the Arial-based fallback last, so it can
    // never stand in for an Arabic face that has not loaded.
    const tag = renderHtmlTag();
    expect(tag).toContain(
      "--font-bricolage:bricolage-grotesque/latin, bricolage-grotesque/latin-ext, bricolage-grotesque/vietnamese, &#x27;Bricolage Grotesque Fallback&#x27;;",
    );
    expect(tag).toContain(
      "--font-dm-sans:dm-sans/latin, dm-sans/latin-ext, dm-sans/latin Fallback;",
    );
    expect(tag).toContain(
      "--font-cairo:cairo/latin, cairo/latin-ext, cairo/arabic, cairo/latin Fallback;",
    );
    expect(tag).toContain(
      "--font-noto-arabic:noto-sans-arabic/latin, noto-sans-arabic/latin-ext, noto-sans-arabic/symbols, noto-sans-arabic/math, noto-sans-arabic/arabic, noto-sans-arabic/latin Fallback",
    );
  });

  it("declares Bricolage's fallback with the regular-weight metrics", () => {
    // next/font/local would measure the variable file's default instance,
    // ExtraBold, so this fallback is written by hand in globals.css.
    const css = readFileSync(join(__dirname, "globals.css"), "utf8");
    const face = css.match(
      /@font-face\s*\{[^}]*font-family:\s*"Bricolage Grotesque Fallback";[^}]*\}/,
    )?.[0];
    expect(face).toBeDefined();
    expect(face).toContain('src: local("Arial");');
    expect(face).toContain("size-adjust: 105.43%;");
    expect(face).toContain("ascent-override: 88.21%;");
    expect(face).toContain("descent-override: 25.61%;");
    expect(face).toContain("line-gap-override: 0%;");
  });

  it("gives every face a unicode-range and a committed file, and declares every committed file", () => {
    renderHtmlTag();
    const declared = new Set<string>();
    for (const call of fontCalls) {
      expect(call.declarations?.find((d) => d.prop === "unicode-range")?.value).toMatch(/^U\+/);
      for (const { path } of call.src) {
        expect(existsSync(join(fontsDir, path))).toBe(true);
        declared.add(path.replace(/^\.\//, ""));
      }
    }
    const committed = readdirSync(fontsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((dir) =>
        readdirSync(join(fontsDir, dir.name))
          .filter((file) => file.endsWith(".woff2"))
          .map((file) => `${dir.name}/${file}`),
      );
    expect([...declared].sort()).toEqual(committed.sort());
  });

  it("no source file loads fonts from Google at build time", () => {
    // next/font/google downloads every face during `next build`; one failed
    // fetch fails the build (CI runs 39695973027, PR #167). Fonts are
    // committed under app/fonts and loaded with next/font/local instead.
    const offenders = sourceFiles(appRoot)
      .filter((file) => /["']next\/font\/google["']/.test(readFileSync(file, "utf8")))
      .map((file) => relative(appRoot, file));
    expect(offenders).toEqual([]);
  });
});
