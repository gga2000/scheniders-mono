// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const toastWarning = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: { warning: (...a: unknown[]) => toastWarning(...a) } }));

import { openWhatsAppChat } from "./open-whatsapp-chat";

const t = (k: string) => k;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("openWhatsAppChat", () => {
    beforeEach(() => {
        toastWarning.mockReset();
        vi.restoreAllMocks();
    });

    it("opens the chat and records contact, with no toast", () => {
        const open = vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
        const onOpened = vi.fn();
        openWhatsAppChat("07701234567", "hi", t, onOpened);
        expect(open).toHaveBeenCalledWith(expect.stringContaining("wa.me"), "_blank");
        expect(onOpened).toHaveBeenCalledOnce();
        expect(toastWarning).not.toHaveBeenCalled();
    });

    it("copies the link and warns with a toast when the tab is blocked", async () => {
        vi.spyOn(window, "open").mockReturnValue(null);
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        openWhatsAppChat("07701234567", "hi", t);
        await flush();
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("wa.me"));
        expect(toastWarning).toHaveBeenCalledWith("orders.card.popupBlocked", expect.objectContaining({ action: expect.any(Object) }));
    });

    it("offers an Open button when the clipboard also fails", async () => {
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
        openWhatsAppChat("07701234567", "hi", t);
        await flush();
        const [title, extras] = toastWarning.mock.calls[0] as [string, { action: { onClick: () => void } }];
        expect(title).toBe("orders.card.popupBlockedNoCopy");
        extras.action.onClick();
        expect(open).toHaveBeenCalledTimes(2);
    });
});
