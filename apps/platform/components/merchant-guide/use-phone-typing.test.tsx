/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { opensKeyboard, usePhoneTyping } from "./use-phone-typing";

afterEach(cleanup);

function setWidth(px: number): void {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });
}

function Probe() {
    return (
        <>
            <span data-testid="typing">{String(usePhoneTyping())}</span>
            <input data-testid="name" />
            <input data-testid="tick" type="checkbox" />
        </>
    );
}

describe("opensKeyboard", () => {
    it("is true for text fields and false for ticks and buttons", () => {
        expect(opensKeyboard(document.createElement("textarea"))).toBe(true);
        expect(opensKeyboard(Object.assign(document.createElement("input"), { type: "number" }))).toBe(true);
        expect(opensKeyboard(Object.assign(document.createElement("input"), { type: "checkbox" }))).toBe(false);
        expect(opensKeyboard(Object.assign(document.createElement("input"), { readOnly: true }))).toBe(false);
        expect(opensKeyboard(document.createElement("button"))).toBe(false);
        expect(opensKeyboard(null)).toBe(false);
    });
});

describe("usePhoneTyping (the guide's card steps aside for the keyboard)", () => {
    it("is true on a phone while a text field has focus, and false again when it leaves", () => {
        setWidth(390);
        render(<Probe />);
        expect(screen.getByTestId("typing").textContent).toBe("false");
        act(() => screen.getByTestId("name").focus());
        expect(screen.getByTestId("typing").textContent).toBe("true");
        act(() => screen.getByTestId("tick").focus());
        expect(screen.getByTestId("typing").textContent).toBe("false");
        act(() => screen.getByTestId("name").focus());
        act(() => screen.getByTestId("name").blur());
        expect(screen.getByTestId("typing").textContent).toBe("false");
    });

    it("stays false on a computer", () => {
        setWidth(1440);
        render(<Probe />);
        act(() => screen.getByTestId("name").focus());
        expect(screen.getByTestId("typing").textContent).toBe("false");
    });
});
