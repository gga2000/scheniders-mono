// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

type MutateOptions = { onSuccess?: () => void; onError?: () => void };
const mutate = vi.fn<(body: unknown, options: MutateOptions) => void>();
const thread: { data: { whatsapp: string | null } | undefined } = { data: undefined };
const openChat = vi.fn();
vi.mock("@/hooks/use-support", () => ({
    useSupportThread: () => thread,
    useSupportAction: () => ({ mutate, isPending: false }),
}));
vi.mock("@/components/providers/language-provider", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "ar" }),
}));
vi.mock("@/store/use-support-store", () => ({
    useSupportStore: (pick: (s: { open: () => void }) => unknown) => pick({ open: openChat }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/orders" }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { ChangeRequestButton } from "./change-request-button";

afterEach(cleanup);

describe("«عندك تعديل؟» in the header", () => {
    beforeEach(() => {
        mutate.mockReset();
        openChat.mockReset();
        thread.data = { whatsapp: "https://wa.me/9647746128551?text=x" };
    });

    it("sends what the merchant wrote to the Help chat, marked as a change request", () => {
        render(<ChangeRequestButton />);
        fireEvent.click(screen.getByText("changeRequest.button"));
        expect(screen.getByText("changeRequest.title")).toBeTruthy();
        expect(screen.getByText("changeRequest.body")).toBeTruthy();

        const send = screen.getByText("changeRequest.send").closest("button") as HTMLButtonElement;
        expect(send.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("changeRequest.title"), { target: { value: "  أريد فلتر حسب المحافظة  " } });
        fireEvent.click(send);

        expect(mutate).toHaveBeenCalledWith(
            {
                action: "send",
                body: "أريد فلتر حسب المحافظة",
                context: expect.objectContaining({ kind: "change_request", path: "/orders", language: "ar" }),
            },
            expect.anything(),
        );
        act(() => mutate.mock.calls[0]?.[1].onSuccess?.());
        expect(screen.getByText("changeRequest.sentTitle")).toBeTruthy();
        fireEvent.click(screen.getByText("changeRequest.openChat"));
        expect(openChat).toHaveBeenCalled();
    });

    it("offers WhatsApp beside it only when our number is set", () => {
        render(<ChangeRequestButton />);
        fireEvent.click(screen.getByText("changeRequest.button"));
        expect(screen.getByText("support.whatsapp").closest("a")?.getAttribute("href")).toBe("https://wa.me/9647746128551?text=x");
        cleanup();

        thread.data = { whatsapp: null };
        render(<ChangeRequestButton />);
        fireEvent.click(screen.getByText("changeRequest.button"));
        expect(screen.queryByText("support.whatsapp")).toBeNull();
    });
});
