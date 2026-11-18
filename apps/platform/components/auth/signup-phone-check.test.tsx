import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignupPhoneCheck } from "./signup-phone-check";

const fetchMock = vi.fn();
const captcha = { enabled: true, ready: true, token: "tok-1", failed: false, reset: vi.fn(), fresh: vi.fn(), ref: { current: null }, onToken: vi.fn(), onFailure: vi.fn() };
const t = (key: string, vars?: unknown) => (vars && typeof vars === "object" ? `${key} ${Object.values(vars).join(" ")}` : key);

function json(status: number, body: unknown) {
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function Harness({ onProof }: { onProof: (proof: string | null) => void }) {
    const [phone, setPhone] = useState("");
    const [proof, setProof] = useState<string | null>(null);
    return (
        <SignupPhoneCheck
            phone={phone}
            onPhoneChange={setPhone}
            proof={proof}
            onProof={(p) => {
                setProof(p);
                onProof(p);
            }}
            captcha={captcha}
            t={t as never}
            dir="ltr"
        />
    );
}

beforeEach(() => {
    fetchMock.mockReset();
    captcha.reset.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("«رقم الواتساب» at signup (Fermi B11)", () => {
    it("sends a code to the number, checks the six digits as soon as they are typed, and hands back the proof", async () => {
        const onProof = vi.fn();
        render(<Harness onProof={onProof} />);
        const send = screen.getByTestId("signup-code-send") as HTMLButtonElement;
        expect(send.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("signup.code.phoneLabel"), { target: { value: "+964 770 123 4567" } });
        expect(send.disabled).toBe(false);

        fetchMock.mockReturnValueOnce(json(200, { success: true, data: { phone: "07701234567", resend_after: 60 } }));
        fireEvent.click(send);
        await waitFor(() => expect(screen.getByTestId("signup-code-input")).toBeTruthy());
        expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/phone-code");
        expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ phone: "07701234567", captcha_token: "tok-1" });
        expect(captcha.reset).toHaveBeenCalled();
        expect((screen.getByTestId("signup-code-resend") as HTMLButtonElement).disabled).toBe(true);

        fetchMock.mockReturnValueOnce(json(200, { success: true, data: { proof: "row-1" } }));
        fireEvent.change(screen.getByTestId("signup-code-input"), { target: { value: "١٢٣٤٥٦" } });
        await waitFor(() => expect(onProof).toHaveBeenCalledWith("row-1"));
        expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({ phone: "07701234567", code: "123456" });
        expect(screen.getByTestId("signup-phone-verified").textContent).toBe("0770 123 4567");
    });

    it("says the code is wrong and lets the merchant type it again", async () => {
        render(<Harness onProof={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("signup.code.phoneLabel"), { target: { value: "07701234567" } });
        fetchMock.mockReturnValueOnce(json(200, { success: true, data: { phone: "07701234567", resend_after: 60 } }));
        fireEvent.click(screen.getByTestId("signup-code-send"));
        await waitFor(() => expect(screen.getByTestId("signup-code-input")).toBeTruthy());

        fetchMock.mockReturnValueOnce(json(422, { success: false, error: "wrong" }));
        fireEvent.change(screen.getByTestId("signup-code-input"), { target: { value: "000000" } });
        await waitFor(() => expect(screen.getByTestId("signup-code-error").textContent).toBe("signup.code.wrong"));
        expect((screen.getByTestId("signup-code-input") as HTMLInputElement).value).toBe("");
    });

    it("explains a code that could not be sent", async () => {
        render(<Harness onProof={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("signup.code.phoneLabel"), { target: { value: "07701234567" } });
        fetchMock.mockReturnValueOnce(json(502, { success: false, error: "send_failed" }));
        fireEvent.click(screen.getByTestId("signup-code-send"));
        await waitFor(() => expect(screen.getByTestId("signup-code-error").textContent).toBe("signup.code.sendFailed"));
        expect(screen.queryByTestId("signup-code-input")).toBeNull();
    });
});
