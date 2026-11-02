/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { MessageTemplatesList } from "./message-templates-list";

const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));

let insertPayload: unknown;
let insertResult: { data: unknown; error: { message: string } | null };

vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            select: () => ({ order: async () => ({ data: [], error: null }) }),
            insert: (rows: unknown) => {
                insertPayload = rows;
                return { select: () => ({ single: async () => insertResult }) };
            },
        }),
    },
}));

beforeEach(() => {
    insertPayload = undefined;
    insertResult = { data: { id: "t1", name: "Hi", content: "", is_active: true }, error: null };
});
afterEach(() => { cleanup(); toastError.mockReset(); });

async function saveNewTemplate() {
    render(<LanguageProvider><MessageTemplatesList /></LanguageProvider>);
    fireEvent.click(await screen.findByText("New Template"));
    fireEvent.change(await screen.findByPlaceholderText("e.g. Order Confirmation"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByText("Save Template"));
}

describe("MessageTemplatesList save", () => {
    it("sends the signed-in tenant id with a new template (RLS rejects rows without one)", async () => {
        await saveNewTemplate();
        await waitFor(() => expect(insertPayload).toBeDefined());
        expect(insertPayload).toEqual([expect.objectContaining({ name: "Hi", tenant_id: "tenant-1" })]);
    });

    it("shows the error and keeps the dialog open when the insert is refused", async () => {
        insertResult = { data: null, error: { message: "new row violates row-level security policy" } };
        await saveNewTemplate();
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(screen.getByText("Save Template")).toBeTruthy();
    });
});
