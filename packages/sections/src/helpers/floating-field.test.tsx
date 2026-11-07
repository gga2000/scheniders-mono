// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FloatingField, splitLetters } from "./floating-field";

function Field({ filled = false, rtl = false, label = "Full name" }) {
  return (
    <FloatingField label={label} htmlFor="f" filled={filled} rtl={rtl}>
      <input id="f" />
    </FloatingField>
  );
}

afterEach(cleanup);

describe("FloatingField", () => {
  it("rests inside the box when empty and unfocused", () => {
    const { container } = render(<Field />);
    expect(container.firstElementChild?.getAttribute("data-floated")).toBe(
      "false",
    );
  });

  it("lifts when the control has focus and drops back on blur", () => {
    const { container } = render(<Field />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(container.firstElementChild?.getAttribute("data-floated")).toBe(
      "true",
    );
    fireEvent.blur(input);
    expect(container.firstElementChild?.getAttribute("data-floated")).toBe(
      "false",
    );
  });

  it("stays lifted while the control holds a value", () => {
    const { container } = render(<Field filled />);
    expect(container.firstElementChild?.getAttribute("data-floated")).toBe(
      "true",
    );
  });

  it("splits the label into letters and keeps the full text for screen readers", () => {
    render(<Field rtl label="أقرب نقطة" />);
    const label = screen.getByText((_, el) => el?.tagName === "LABEL");
    expect(label.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("textbox", { name: "أقرب نقطة" })).toBe(
      screen.getByRole("textbox"),
    );
    expect(label.querySelectorAll("[aria-hidden] span span")).toHaveLength(8);
  });

  it("points the label at its control", () => {
    render(<Field />);
    expect(screen.getByRole("textbox", { name: "Full name" })).toBe(
      screen.getByRole("textbox"),
    );
  });
});

describe("splitLetters", () => {
  const Z = "\u200D";

  it("leaves Latin letters as they are", () => {
    expect(splitLetters("Name")).toEqual(["N", "a", "m", "e"]);
  });

  it("joins Arabic letters to both neighbours with zero-width joiners", () => {
    // ب ي ت: every letter joins both ways.
    expect(splitLetters("بيت")).toEqual([`ب${Z}`, `${Z}ي${Z}`, `${Z}ت`]);
  });

  it("does not join across a letter that only joins backwards", () => {
    // ا never joins the letter after it, so ل starts a new joined run.
    expect(splitLetters("الاسم")).toEqual([
      "ا",
      `ل${Z}`,
      `${Z}ا`,
      `س${Z}`,
      `${Z}م`,
    ]);
  });

  it("keeps harakat on their letter", () => {
    expect(splitLetters("يفضّل")).toEqual([
      `ي${Z}`,
      `${Z}ف${Z}`,
      `${Z}ضّ${Z}`,
      `${Z}ل`,
    ]);
  });
});
