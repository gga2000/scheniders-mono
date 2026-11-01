// @vitest-environment jsdom
// =====================================================================
// site_header — overlay surface: the menu sheet at every width
// =====================================================================
// Bento / floating_pill keep their phone-only sheet byte-for-byte. The
// overlay opens a full-height drawer instead: its bar must sit ABOVE the
// drawer while open (else a tap on the X lands on the drawer), and Arabic
// rows sit against the right edge without anything setting `dir`.
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
        drawer={{
          categories: [
            { id: "c1", href: "/categories/men", label: "رجالي", count: 5, image: null },
          ],
          whatsappHref: "https://wa.me/9647700000000",
          showSearch: true,
        }}
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

describe("OverlayHeader menu drawer", () => {
  it("lifts the bar above the drawer only while it is open", () => {
    const { container, getByRole } = renderOverlay("ar");
    const toggle = getByRole("button", { name: "menu" });
    expect(bar(container).className).not.toMatch(/\bz-20\b/);
    expect(container.querySelector("[data-menu-drawer]")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const drawer = container.querySelector("[data-menu-drawer]");
    expect(drawer?.className).toMatch(/\bfixed inset-0 z-10\b/);
    expect(bar(container).className).toMatch(/\brelative\b/);
    expect(bar(container).className).toMatch(/\bz-20\b/);
    // The toggle lives inside the lifted bar, so a tap on the X reaches it.
    expect(bar(container).contains(toggle)).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(bar(container).className).not.toMatch(/\bz-20\b/);
  });

  it("lists search, the categories, the nav links, track and WhatsApp", () => {
    const { container, getByRole } = renderOverlay("ar");
    fireEvent.click(getByRole("button", { name: "menu" }));
    const drawer = container.querySelector('[role="dialog"]');
    expect(drawer?.querySelector('form[role="search"] input[name="q"]')).not.toBeNull();
    expect(drawer?.querySelector("[data-drawer-category]")?.getAttribute("href")).toBe("/categories/men");
    expect(drawer?.textContent).toContain("5 عطور");
    for (const l of links) expect(drawer?.textContent).toContain(l.label);
    expect(drawer?.querySelector("[data-drawer-track]")?.getAttribute("href")).toBe("/track");
    expect(drawer?.querySelector("[data-drawer-whatsapp]")?.getAttribute("href")).toBe(
      "https://wa.me/9647700000000",
    );
  });

  it("closes when a row is followed", () => {
    const { container, getByRole } = renderOverlay("ar");
    fireEvent.click(getByRole("button", { name: "menu" }));
    fireEvent.click(container.querySelector("[data-drawer-category]") as HTMLElement);
    expect(container.querySelector("[data-menu-drawer]")).toBeNull();
  });

  it("right-aligns Arabic rows without setting dir", () => {
    const { container, getByRole } = renderOverlay("ar");
    fireEvent.click(getByRole("button", { name: "menu" }));
    const row = container.querySelector("[data-drawer-category]");
    expect(row?.className).toMatch(/\bflex-row-reverse\b/);
    expect(row?.firstElementChild?.className).toMatch(/\btext-right\b/);
    expect(container.querySelector("[dir]")).toBeNull();
  });

  it("leaves English rows start-aligned", () => {
    const { container, getByRole } = renderOverlay("en");
    fireEvent.click(getByRole("button", { name: "menu" }));
    const row = container.querySelector("[data-drawer-category]");
    expect(row?.className).not.toMatch(/\bflex-row-reverse\b/);
    expect(row?.firstElementChild?.className).not.toMatch(/\btext-right\b/);
  });
});
