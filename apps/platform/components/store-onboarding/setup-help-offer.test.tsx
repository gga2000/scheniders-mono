import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupportCallBack } from "@/lib/support/schema";

const mutate = vi.fn();
const thread: { data: { callBack: SupportCallBack | null; contactPhone: string | null } | undefined } = { data: undefined };
vi.mock("@/hooks/use-support", () => ({
    SupportRequestError: class extends Error {},
    useSupportThread: () => thread,
    useSupportAction: () => ({ mutate, isPending: false }),
}));
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        t: (k: string, vars?: Record<string, string>) => (vars?.phone ? `${k} ${vars.phone}` : k),
        language: "en",
    }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { SetupHelpOffer } from "./setup-help-offer";

afterEach(cleanup);

describe("«تريد نساعدك بالإعداد؟» in the setup wizard (Fermi B11)", () => {
    beforeEach(() => {
        mutate.mockReset();
        thread.data = { callBack: null, contactPhone: "07701234567" };
    });

    it("offers free help, then asks for a call marked setup on the shop's own mobile", () => {
        render(<SetupHelpOffer defaultPhone="" />);
        expect(screen.getByText("wizard.help.title")).toBeTruthy();
        fireEvent.click(screen.getByTestId("setup-help-yes"));

        const field = screen.getByLabelText("support.callBack.label") as HTMLInputElement;
        expect(field.value).toBe("07701234567");
        fireEvent.click(screen.getByTestId("setup-help-send"));
        expect(mutate).toHaveBeenCalledWith({ action: "callBack", phone: "07701234567", topic: "setup" }, expect.anything());
    });

    it("fills the signup number when the support thread has not loaded, and holds a number that is not a mobile", () => {
        thread.data = undefined;
        render(<SetupHelpOffer defaultPhone="+964 780 111 2222" />);
        fireEvent.click(screen.getByTestId("setup-help-yes"));
        const field = screen.getByLabelText("support.callBack.label") as HTMLInputElement;
        expect(field.value).toBe("07801112222");

        fireEvent.change(field, { target: { value: "123" } });
        expect((screen.getByTestId("setup-help-send") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByTestId("setup-help-send"));
        expect(mutate).not.toHaveBeenCalled();
    });

    it("once asked, says which number we will call instead of offering again", () => {
        thread.data = { callBack: { phone: "07701234567", due_at: "2020-01-01T00:00:00Z", topic: "setup" }, contactPhone: null };
        render(<SetupHelpOffer defaultPhone="" />);
        expect(screen.getByTestId("setup-help-asked").textContent).toBe("wizard.help.asked 0770 123 4567");
        expect(screen.queryByTestId("setup-help-yes")).toBeNull();
    });

    it("a plain call asked from the Help chat still leaves the setup offer open", () => {
        thread.data = { callBack: { phone: "07701234567", due_at: "2020-01-01T00:00:00Z", topic: null }, contactPhone: null };
        render(<SetupHelpOffer defaultPhone="" />);
        expect(screen.getByTestId("setup-help-yes")).toBeTruthy();
    });
});
