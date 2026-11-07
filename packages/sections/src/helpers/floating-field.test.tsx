// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FloatingField } from "./floating-field";

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

  it("splits by word, never by letter, so Arabic keeps its joined letters", () => {
    render(<Field rtl label="أقرب نقطة دالة" />);
    const label = screen.getByText((_, el) => el?.tagName === "LABEL");
    expect(label.getAttribute("dir")).toBe("rtl");
    expect(label.textContent).toBe("أقرب نقطة دالة");
    expect(label.querySelectorAll("span > span")).toHaveLength(3);
  });

  it("points the label at its control", () => {
    render(<Field />);
    expect(screen.getByLabelText("Full name")).toBe(
      screen.getByRole("textbox"),
    );
  });
});
