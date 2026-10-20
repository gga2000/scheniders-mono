// The storefront is LTR in every locale, Arabic included (CLAUDE.md): the root
// document sets `<html lang>` (HtmlLang later corrects it per tenant) and never
// `<html dir>`. LTR is the HTML default, so leaving `dir` off keeps every
// store LTR.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font-var" });
  return { Bricolage_Grotesque: font, Cairo: font, DM_Sans: font, Noto_Sans_Arabic: font };
});

import RootLayout from "./layout";

describe("storefront root document", () => {
  it("root layout sets <html lang> and no dir", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>store</main>
      </RootLayout>,
    );
    const tag = markup.match(/<html\b[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).toMatch(/\slang="ar"/);
    expect(tag).not.toMatch(/\sdir=/);
  });
});
