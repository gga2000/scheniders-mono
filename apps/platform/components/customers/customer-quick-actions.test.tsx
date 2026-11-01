// @vitest-environment jsdom
// A failed note or tag write must tell staff and must not discard what they typed.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (options: unknown) => toast(options) }));
vi.mock("@/hooks/use-language", () => ({
    // The second argument is a fallback string or the message's variables, as in the real t().
    useLanguage: () => ({ t: (key: string, fallback?: string | Record<string, string>) => (typeof fallback === "string" ? fallback : key) }),
}));

const assignTag = vi.fn<(tagId: string) => Promise<boolean>>();
const removeTag = vi.fn<(tagId: string) => Promise<boolean>>();
const createTag = vi.fn();
vi.mock("@/hooks/use-customer-management", () => ({
    useCustomerTags: () => ({ tags: [{ id: "t1", name: "VIP", color: "blue" }], createTag }),
    useCustomerTagAssignments: () => ({ assignments: [], assignTag, removeTag }),
}));

const mutate = vi.fn();
vi.mock("@/hooks/use-customer-notes", () => ({
    useAddCustomerNote: () => ({ mutate, isPending: false }),
}));

import { CustomerQuickActions } from "./customer-quick-actions";

function renderActions() {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return render(<CustomerQuickActions phone="07701234567" />, { wrapper });
}

describe("CustomerQuickActions failures", () => {
    beforeEach(() => {
        toast.mockClear();
        mutate.mockReset();
        assignTag.mockReset();
    });
    afterEach(cleanup);

    it("toasts and keeps the text when the note is not saved", () => {
        mutate.mockImplementation((_note: string, options: { onError: () => void }) => options.onError());
        renderActions();
        const box = screen.getByPlaceholderText("Add a quick note…") as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: "call back tomorrow" } });
        fireEvent.click(screen.getByText("Add"));
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
        expect(box.value).toBe("call back tomorrow");
    });

    it("clears the box after a saved note", () => {
        mutate.mockImplementation((_note: string, options: { onSuccess: () => void }) => options.onSuccess());
        renderActions();
        const box = screen.getByPlaceholderText("Add a quick note…") as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: "ok" } });
        fireEvent.click(screen.getByText("Add"));
        expect(toast).not.toHaveBeenCalled();
        expect(box.value).toBe("");
    });

    it("toasts when a tag toggle fails", async () => {
        assignTag.mockResolvedValue(false);
        renderActions();
        fireEvent.click(screen.getByText("VIP"));
        await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
    });

    it("says a rating-named tag changes no rating before it is added", () => {
        renderActions();
        const note = screen.getByRole("tooltip", { hidden: true });
        expect(note.textContent).toBe("customers.tag.ratingClash");
    });

    it("opens the rating-clash note below the tag, clear of the section heading above", () => {
        renderActions();
        const note = screen.getByRole("tooltip", { hidden: true });
        expect(note.className).toContain("top-full");
        expect(note.className).not.toContain("bottom-full");
    });

    it("keeps the note box left-set while dir=\"auto\" orders an Arabic note's words", () => {
        renderActions();
        const box = screen.getByPlaceholderText("Add a quick note…");
        expect(box.getAttribute("dir")).toBe("auto");
        expect(box.className).toContain("text-left");
    });
});
