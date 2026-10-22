// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NoteRow } from "./note-row";

afterEach(cleanup);

const CARDS = [
  { title: "الليمون", body: "حمضي منعش يفتح النفس من أول رشة" },
  { title: "جوز الهند", body: "كريمي ودافي" },
];

function bodyOf(button: HTMLElement): string {
  return button.querySelector("[data-note-body]")?.className ?? "";
}

describe("NoteRow", () => {
  it("opens one card's full line at a time", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    const lemon = screen.getByRole("button", { name: /الليمون/ });
    const coconut = screen.getByRole("button", { name: /جوز الهند/ });

    expect(lemon.getAttribute("aria-expanded")).toBe("false");
    expect(bodyOf(lemon)).toContain("line-clamp-1");

    fireEvent.click(lemon);
    expect(lemon.getAttribute("aria-expanded")).toBe("true");
    expect(bodyOf(lemon)).not.toContain("line-clamp-1");

    fireEvent.click(coconut);
    expect(lemon.getAttribute("aria-expanded")).toBe("false");
    expect(coconut.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(coconut);
    expect(coconut.getAttribute("aria-expanded")).toBe("false");
  });

  it("names the list for assistive tech", () => {
    render(<NoteRow cards={CARDS} title="" locale="ar" />);
    expect(screen.getByRole("list", { name: "مكونات العطر" })).toBeTruthy();
  });
});
