// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { latinDigitsValue } from "./latin-digits-input";

afterEach(cleanup);

function Harness() {
    const [value, setValue] = useState("");
    return (
        <>
            <input aria-label="phone" type="tel" value={value} onChange={(e) => setValue(latinDigitsValue(e))} />
            <output data-testid="value">{value}</output>
        </>
    );
}

describe("latinDigitsValue", () => {
    it("keeps Arabic and Persian digits as 0-9, in the field and in state", () => {
        render(<Harness />);
        const input = screen.getByLabelText("phone") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "٠٧٧٠ ١٢٣ ٤٥٦٧" } });
        expect(input.value).toBe("0770 123 4567");
        expect(screen.getByTestId("value").textContent).toBe("0770 123 4567");
        fireEvent.change(input, { target: { value: "+۹۶۴۷۷۰" } });
        expect(screen.getByTestId("value").textContent).toBe("+964770");
    });

    it("leaves the caret where it was when a digit in the middle is changed", () => {
        render(<Harness />);
        const input = screen.getByLabelText("phone") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "07701234567" } });
        // As the browser does: the typed character lands, the caret sits after it, then React hears of it.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "077٠1234567");
        input.setSelectionRange(4, 4);
        fireEvent.change(input);
        expect(input.value).toBe("07701234567");
        expect(input.selectionStart).toBe(4);
    });
});
