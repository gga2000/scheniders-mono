// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomSheet } from "./bottom-sheet";

beforeEach(() => {
  // jsdom has no modal dialog: open/close just flip the attribute, and
  // close fires the native "close" event like a browser does.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  document.documentElement.style.overflow = "";
});

afterEach(() => cleanup());

function mount(locale: "ar" | "en" = "ar") {
  render(
    <BottomSheet trigger="قصة العطر" title="قصة العطر" closeLabel="إغلاق" locale={locale}>
      <p>ملك العطور الجديد</p>
    </BottomSheet>,
  );
  const trigger = screen.getByRole("button", { name: "قصة العطر" });
  const dialog = document.querySelector("dialog");
  if (!dialog) throw new Error("no dialog rendered");
  return { trigger, dialog };
}

describe("BottomSheet", () => {
  it("starts closed, with a dialog trigger", () => {
    const { trigger, dialog } = mount();
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens modally from the trigger, named by its title, and locks page scroll", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const titleId = dialog.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe("قصة العطر");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes from the close button and hands focus back to the trigger", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    act(() => fireEvent.click(screen.getByRole("button", { name: "إغلاق" })));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("follows the native close (Escape) and hands focus back", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    act(() => dialog.close());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a backdrop click but not on a click inside the sheet", () => {
    const { trigger, dialog } = mount();
    act(() => fireEvent.click(trigger));
    act(() => fireEvent.click(screen.getByText("ملك العطور الجديد")));
    expect(dialog.open).toBe(true);
    act(() => fireEvent.click(dialog));
    expect(dialog.open).toBe(false);
  });

  it("animates only under motion-safe", () => {
    const { dialog } = mount();
    const classes = dialog.className.split(/\s+/);
    expect(classes.some((c) => c.startsWith("motion-safe:animate-"))).toBe(true);
    expect(classes.some((c) => c.startsWith("animate-"))).toBe(false);
  });

  it("puts the close button on the reading side: reversed row in Arabic only", () => {
    mount("ar");
    expect(document.querySelector("dialog .flex-row-reverse")).not.toBeNull();
    cleanup();
    mount("en");
    expect(document.querySelector("dialog .flex-row-reverse")).toBeNull();
  });

  it("server-renders closed, with its content in the markup and no dir attribute", () => {
    const html = renderToStaticMarkup(
      <BottomSheet trigger="قصة العطر" title="قصة العطر" closeLabel="إغلاق" locale="ar">
        <p>ملك العطور الجديد</p>
      </BottomSheet>,
    );
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toContain("ملك العطور الجديد");
    expect(html).not.toMatch(/\sdir=/);
  });
});
