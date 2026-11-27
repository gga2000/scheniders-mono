import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
    user: null as { email: string } | null,
    tenantId: null as string | null,
    signOut: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
    useTextDir: () => "ltr",
}));
const storeName = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-store-name", () => ({ useStoreName: (id: string | null) => ({ data: storeName(id) }) }));

import { LinkUsedNotice } from "./link-used-notice";

beforeEach(() => {
    auth.user = null;
    auth.tenantId = null;
    auth.signOut.mockReset().mockResolvedValue(undefined);
    storeName.mockReset().mockReturnValue(null);
});
afterEach(cleanup);

describe("a sign-up link opened again after it was used", () => {
    it("says the link no longer works and the account is ready", () => {
        render(<LinkUsedNotice onContinue={vi.fn()} />);
        expect(screen.getByText("login.linkUsed")).toBeTruthy();
        expect(screen.queryByTestId("login-link-used-signed-in")).toBeNull();
    });

    it("names the shop this browser is still signed in to, instead of opening it quietly", () => {
        auth.user = { email: "owner@old-shop.iq" };
        auth.tenantId = "t-1";
        storeName.mockReturnValue("متجر قديم");
        render(<LinkUsedNotice onContinue={vi.fn()} />);
        expect(screen.getByText("متجر قديم")).toBeTruthy();
        expect(screen.getByText("owner@old-shop.iq")).toBeTruthy();
        expect(storeName).toHaveBeenCalledWith("t-1");
    });

    it("signs out to switch accounts, or goes on with this one", async () => {
        auth.user = { email: "owner@old-shop.iq" };
        const onContinue = vi.fn();
        render(<LinkUsedNotice onContinue={onContinue} />);
        fireEvent.click(screen.getByTestId("login-link-used-switch"));
        await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
        fireEvent.click(screen.getByTestId("login-link-used-continue"));
        expect(onContinue).toHaveBeenCalled();
    });
});
