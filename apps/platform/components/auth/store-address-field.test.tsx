import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { StoreAddressField, storeAddressSendable, useStoreAddress } from "./store-address-field";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

function Harness({ initialName = "", handedAddress }: { initialName?: string; handedAddress?: string | null }) {
    const [name, setName] = useState(initialName);
    const address = useStoreAddress(name, handedAddress);
    return (
        <div>
            <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} />
            <StoreAddressField address={address} t={t} dir="ltr" />
            <span data-testid="sendable">{String(storeAddressSendable(address.state))}</span>
        </div>
    );
}

/** The server's answers, by address. */
function serve(answers: Record<string, object>) {
    const fetchMock = vi.fn(async (url: string) => {
        const slug = new URL(url, "https://app.test").searchParams.get("slug") ?? "";
        return new Response(JSON.stringify(answers[slug] ?? { available: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

const input = () => screen.getByTestId("signup-store-address") as HTMLInputElement;
const status = () => screen.getByTestId("signup-store-address-status").textContent ?? "";

describe("the store address at signup (B11)", () => {
    it("offers the address from the store name and says when it is free", async () => {
        serve({});
        render(<Harness />);
        expect(screen.getByTestId("sendable").textContent).toBe("false");
        fireEvent.change(screen.getByLabelText("name"), { target: { value: "متجر زهراء" } });
        expect(input().value).toBe("mtjr-zhra");
        await waitFor(() => expect(status()).toContain("signup.addressFree"));
        expect(screen.getByTestId("sendable").textContent).toBe("true");
    });

    it("moves an offered address that is taken to the free one the server suggests", async () => {
        serve({ noor: { available: false, reason: "taken", suggestion: "noor-2" } });
        render(<Harness initialName="Noor" />);
        await waitFor(() => expect(input().value).toBe("noor-2"));
        await waitFor(() => expect(status()).toContain("signup.addressFree"));
    });

    it("keeps an address the merchant typed, and offers the free one as a button", async () => {
        serve({ zahraa: { available: false, reason: "taken", suggestion: "zahraa-2" } });
        render(<Harness initialName="Noor" />);
        fireEvent.change(input(), { target: { value: "Zahraa" } });
        expect(input().value).toBe("zahraa");
        await waitFor(() => expect(status()).toContain("signup.addressTaken"));
        expect(screen.getByTestId("sendable").textContent).toBe("false");
        fireEvent.click(screen.getByTestId("signup-store-address-suggestion"));
        expect(input().value).toBe("zahraa-2");
        await waitFor(() => expect(status()).toContain("signup.addressFree"));
    });

    it("explains a badly formed address without asking the server", async () => {
        const fetchMock = serve({});
        render(<Harness initialName="Noor" />);
        fireEvent.change(input(), { target: { value: "no" } });
        expect(status()).toContain("signup.addressInvalid");
        expect(screen.getByTestId("sendable").textContent).toBe("false");
        await new Promise((r) => setTimeout(r, 450));
        expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain("/api/auth/slug-available?slug=no");
    });

    it("keeps the address handed over from usefermi.com, even when the name changes", async () => {
        serve({});
        render(<Harness initialName="ليالي" handedAddress="layali" />);
        expect(input().value).toBe("layali");
        fireEvent.change(screen.getByLabelText("name"), { target: { value: "ليالي بغداد" } });
        expect(input().value).toBe("layali");
        await waitFor(() => expect(screen.getByTestId("sendable").textContent).toBe("true"));
    });

    it("ignores an empty handed-over address and follows the name", () => {
        serve({});
        render(<Harness initialName="shop one" handedAddress="  " />);
        expect(input().value).not.toBe("");
    });
});
