import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IqdInput } from "./iqd-input";

afterEach(cleanup);

describe("IqdInput", () => {
    it("shows thousands separators at rest and plain digits while typing", () => {
        const onChange = vi.fn();
        render(<IqdInput value={95000} onChange={onChange} aria-label="price" />);
        const input = screen.getByLabelText("price") as HTMLInputElement;
        expect(input.value).toBe("95,000");
        fireEvent.focus(input);
        expect(input.value).toBe("95000");
        fireEvent.change(input, { target: { value: "110000" } });
        expect(onChange).toHaveBeenCalledWith(110000);
    });

    it("reads Arabic digits and pasted separators as a number", () => {
        const onChange = vi.fn();
        render(<IqdInput value={0} onChange={onChange} aria-label="price" />);
        fireEvent.change(screen.getByLabelText("price"), { target: { value: "١٥٬٠٠٠" } });
        expect(onChange).toHaveBeenCalledWith(15000);
    });
});
