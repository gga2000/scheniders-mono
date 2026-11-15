/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { QiPaymentCheck } from "@/hooks/use-qi-topup";

const PAYMENT = "66666666-6666-4666-8666-666666666666";
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
const replace = vi.hoisted(() => vi.fn());
const checkQiPayment = vi.hoisted(() => vi.fn<(id: string) => Promise<QiPaymentCheck>>());

vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/hooks/use-qi-topup", () => ({ checkQiPayment }));
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(`section=billing&qi=${PAYMENT}`),
    useRouter: () => ({ replace }),
    usePathname: () => "/settings",
}));

const { QiReturnCheck } = await import("./qi-return-check");

const onSettled = vi.fn();
const show = () => render(<LanguageProvider><QiReturnCheck onSettled={onSettled} /></LanguageProvider>);

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(cleanup);

describe("QiReturnCheck", () => {
    it("checks the payment once, says it is paid, refreshes the wallet and clears the address", async () => {
        checkQiPayment.mockResolvedValue({ status: "success", amount: 50_000, cardSaved: true });
        show();
        await waitFor(() => expect(onSettled).toHaveBeenCalled());
        expect(checkQiPayment.mock.calls).toEqual([[PAYMENT]]);
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.warning).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith("/settings?section=billing");
    });

    it("tells the shop when Qi gave no card it may charge alone, so the card was not saved", async () => {
        checkQiPayment.mockResolvedValue({ status: "success", amount: 50_000, cardSaved: false });
        show();
        await waitFor(() => expect(onSettled).toHaveBeenCalled());
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("لم نحفظها"));
    });

    it("says nothing about a card the shop did not ask to save", async () => {
        checkQiPayment.mockResolvedValue({ status: "success", amount: 50_000, cardSaved: null });
        show();
        await waitFor(() => expect(onSettled).toHaveBeenCalled());
        expect(toast.warning).not.toHaveBeenCalled();
    });

    it.each(["failed", "canceled"] as const)("says a %s payment took no money", async (status) => {
        checkQiPayment.mockResolvedValue({ status, amount: 50_000, cardSaved: null });
        show();
        await waitFor(() => expect(onSettled).toHaveBeenCalled());
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("لم يُخصم"));
        expect(toast.success).not.toHaveBeenCalled();
    });

    it("says the payment is not confirmed yet when the check fails, and never says paid", async () => {
        checkQiPayment.mockRejectedValue(new Error("qi_check_502"));
        show();
        await waitFor(() => expect(onSettled).toHaveBeenCalled());
        expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("لم يؤكد"));
        expect(toast.success).not.toHaveBeenCalled();
    });
});
