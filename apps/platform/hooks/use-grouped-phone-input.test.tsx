// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useGroupedPhoneInput } from "./use-grouped-phone-input";

afterEach(cleanup);

function Harness({ initial = "" }: { initial?: string }) {
    const [raw, setRaw] = useState(initial);
    const phoneInput = useGroupedPhoneInput(raw, setRaw);
    return (
        <>
            <input aria-label="phone" {...phoneInput} />
            <output data-testid="raw">{raw}</output>
        </>
    );
}

describe("useGroupedPhoneInput", () => {
    it("shows the stored value grouped", () => {
        render(<Harness initial="07801234567" />);
        expect((screen.getByLabelText("phone") as HTMLInputElement).value).toBe("0780 123 4567");
        expect(screen.getByTestId("raw").textContent).toBe("07801234567");
    });

    it("stores the un-spaced digits while displaying groups", () => {
        render(<Harness />);
        const input = screen.getByLabelText("phone") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "0780230" } });
        expect(input.value).toBe("0780 230");
        expect(screen.getByTestId("raw").textContent).toBe("0780230");
        fireEvent.change(input, { target: { value: "0780 2301677" } });
        expect(input.value).toBe("0780 123 4567");
        expect(screen.getByTestId("raw").textContent).toBe("07801234567");
    });

    it("keeps a pasted international number as typed (minus spaces)", () => {
        render(<Harness />);
        const input = screen.getByLabelText("phone") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "+964 780 123 4567" } });
        expect(screen.getByTestId("raw").textContent).toBe("+9647801234567");
        expect(input.value).toBe("+9647801234567");
    });
});
