// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EXPRESS_GUTTER } from "./gutter";
import { NoteRow } from "./note-row";

afterEach(cleanup);

const CARDS = [
  { title: "الليمون", body: "حمضي منعش يفتح النفس من أول رشة" },
  { title: "جوز الهند", body: "كريمي ودافي" },
];

function bodyOf(button: HTMLElement): string {
  return button.querySelector("[data-note-body]")?.className ?? "";
}

/** Tailwind v4 emits `.block` after `.line-clamp-1`, so any display utility
 *  next to the clamp overrides its `display: -webkit-box` and the clamp
 *  silently stops clamping. */
const DISPLAY_UTILITY = /(^|\s)(block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table|hidden)(\s|$)/;

describe("NoteRow", () => {
  it("opens one card's full line at a time", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    const lemon = screen.getByRole("button", { name: /الليمون/ });
    const coconut = screen.getByRole("button", { name: /جوز الهند/ });

    expect(lemon.getAttribute("aria-expanded")).toBe("false");
    expect(bodyOf(lemon)).toContain("line-clamp-1");
    expect(bodyOf(lemon)).not.toMatch(DISPLAY_UTILITY);

    fireEvent.click(lemon);
    expect(lemon.getAttribute("aria-expanded")).toBe("true");
    expect(bodyOf(lemon)).not.toContain("line-clamp-1");

    fireEvent.click(coconut);
    expect(lemon.getAttribute("aria-expanded")).toBe("false");
    expect(coconut.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(coconut);
    expect(coconut.getAttribute("aria-expanded")).toBe("false");
  });

  it("starts the row at the reader's side, without dir", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    const list = screen.getByRole("list");
    expect(list.className).toContain("flex-row-reverse");
    expect(list.hasAttribute("dir")).toBe(false);
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.className).toContain("snap-end");
      expect(item.className).not.toContain("snap-start");
    }
    cleanup();

    render(<NoteRow cards={CARDS} title="" locale="en" />);
    expect(screen.getByRole("list").className).not.toContain("flex-row-reverse");
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.className).toContain("snap-start");
    }
  });

  it("bleeds out by exactly the column's gutter", () => {
    const n = /^px-(\d+)$/.exec(EXPRESS_GUTTER.pad)?.[1];
    expect(n).toBeDefined();
    expect(EXPRESS_GUTTER.bleed.split(" ").sort()).toEqual(
      [`-mx-${n}`, `px-${n}`, `scroll-px-${n}`].sort(),
    );
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    for (const cls of EXPRESS_GUTTER.bleed.split(" ")) {
      expect(screen.getByRole("list").classList.contains(cls)).toBe(true);
    }
  });

  it("names the list for assistive tech", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    expect(screen.getByRole("list", { name: "مكونات العطر" })).toBeTruthy();
  });
});
