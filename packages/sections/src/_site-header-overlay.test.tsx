// @vitest-environment jsdom
// =====================================================================
// site_header — overlay surface: the menu sheet at every width
// =====================================================================
// The overlay has no inline nav at any width, so its sheet must stay
// visible past `sm` (`allWidths`), its bar must sit ABOVE the sheet's
// scrim while open (else the X toggle is dimmed and a tap lands on the
// backdrop), and Arabic rows sit against the right edge under the toggle.
// Bento / floating_pill keep their phone-only sheet byte-for-byte.
// =====================================================================

import { afterEach, describe, expect, it } from "vitest";
import React, { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { MobileMenuSheet } from "./site_header.menu";
import { OverlayHeader } from "./site_header.overlay";

afterEach(cleanup);

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/products", label: "المنتجات" },
];

function sheetMarkup(allWidths?: boolean): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <MobileMenuSheet
        id="sheet"
        open
        onClose={() => {}}
        sheetRef={createRef<HTMLDivElement>()}
        links={links}
        linkClassName="row"
        locale="ar"
        enabledLocales={["ar"]}
        className="surface"
        {...(allWidths === undefined ? {} : { allWidths })}
      />
    </StoreBaseProvider>,
  );
}

describe("MobileMenuSheet allWidths", () => {
  it("default (bento / floating_pill) stays phone-only, unchanged", () => {
    const html = sheetMarkup();
    expect(html).toContain('aria-hidden="true" class="fixed inset-0 z-0 sm:hidden"');
    expect(html).toContain('class="relative z-10 sm:hidden surface"');
    // Passing `false` explicitly is the same markup as omitting it.
    expect(sheetMarkup(false)).toBe(html);
  });

  it("allWidths drops sm:hidden from both the backdrop and the dialog", () => {
    const html = sheetMarkup(true);
    expect(html).not.toContain("sm:hidden");
    expect(html).toContain('aria-hidden="true" class="fixed inset-0 z-0"');
    expect(html).toContain('class="relative z-10 surface"');
  });
});

function renderOverlay(locale: LocaleCode) {
  return render(
    <StoreBaseProvider base="">
      <OverlayHeader
        wordmark="Store"
        logo={null}
        locale={locale}
        navLinks={links}
        enabledLocales={["ar", "en"]}
        menuLabel="menu"
      />
    </StoreBaseProvider>,
  );
}

/** The bar is the header's first child; the sheet column follows it. */
function bar(container: HTMLElement): HTMLElement {
  const el = container.querySelector("header > div");
  if (!(el instanceof HTMLElement)) throw new Error("overlay bar not rendered");
  return el;
}

describe("OverlayHeader menu sheet", () => {
  it("lifts the bar above the scrim only while the sheet is open", () => {
    const { container, getByRole } = renderOverlay("ar");
    const toggle = getByRole("button", { name: "menu" });
    expect(bar(container).className).not.toMatch(/\bz-20\b/);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const backdrop = container.querySelector('[aria-hidden="true"].fixed');
    expect(backdrop?.className).toBe("fixed inset-0 z-0");
    expect(bar(container).className).toMatch(/\brelative\b/);
    expect(bar(container).className).toMatch(/\bz-20\b/);
    // The toggle lives inside the lifted bar, so a tap on the X reaches it.
    expect(bar(container).contains(toggle)).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(bar(container).className).not.toMatch(/\bz-20\b/);
  });

  it("right-aligns Arabic sheet rows without setting dir", () => {
    const { container, getByRole } = renderOverlay("ar");
    fireEvent.click(getByRole("button", { name: "menu" }));
    const rows = container.querySelectorAll('[role="dialog"] ul a');
    expect(rows).toHaveLength(links.length);
    for (const row of rows) {
      expect(row.className).toMatch(/\bjustify-end\b/);
      expect(row.className).toMatch(/\btext-right\b/);
    }
    expect(container.querySelector("[dir]")).toBeNull();
  });

  it("leaves English sheet rows start-aligned", () => {
    const { container, getByRole } = renderOverlay("en");
    fireEvent.click(getByRole("button", { name: "menu" }));
    const rows = container.querySelectorAll('[role="dialog"] ul a');
    expect(rows).toHaveLength(links.length);
    for (const row of rows) {
      expect(row.className).not.toMatch(/\bjustify-end\b/);
      expect(row.className).not.toMatch(/\btext-right\b/);
    }
  });
});
