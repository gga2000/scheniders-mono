/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/components/providers/language-provider";
import { useTemplateEditor } from "@/hooks/use-message-templates";
import { MessageTemplatesList } from "./message-templates-list";

const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));

let insertPayload: unknown;
let listTenant: unknown;
let listRows: unknown[] = [];
let deleteError: { message: string } | null = null;
let insertResult: { data: unknown; error: { message: string } | null };

vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            select: () => ({
                eq: (_col: string, tenant: unknown) => {
                    listTenant = tenant;
                    return { order: async () => ({ data: listRows, error: null }) };
                },
            }),
            delete: () => ({ eq: async () => ({ error: deleteError }) }),
            insert: (rows: unknown) => {
                insertPayload = rows;
                return { select: () => ({ single: async () => insertResult }) };
            },
        }),
    },
}));

function Harness() {
    const editor = useTemplateEditor();
    return <MessageTemplatesList editor={editor} />;
}

function renderList() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <LanguageProvider><Harness /></LanguageProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    insertPayload = undefined;
    listTenant = undefined;
    listRows = [];
    deleteError = null;
    insertResult = {
        data: { id: "t1", name: "Hi", content: "", content_ar: "", is_active: true, template_type: null },
        error: null,
    };
});
afterEach(() => { cleanup(); toastError.mockReset(); vi.restoreAllMocks(); });

async function saveNewTemplate() {
    renderList();
    fireEvent.click(await screen.findByText("قالب جديد"));
    fireEvent.change(await screen.findByPlaceholderText("مثلاً: تأكيد الطلب"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByText("حفظ القالب"));
}

describe("MessageTemplatesList", () => {
    it("reads only the signed-in shop's templates", async () => {
        renderList();
        await screen.findByText("قالب جديد");
        expect(listTenant).toBe("tenant-1");
    });

    it("sends the signed-in tenant id with a new template (RLS rejects rows without one)", async () => {
        await saveNewTemplate();
        await waitFor(() => expect(insertPayload).toBeDefined());
        expect(insertPayload).toEqual([expect.objectContaining({ name: "Hi", tenant_id: "tenant-1" })]);
    });

    it("shows the error and keeps the unsaved edits when the insert is refused", async () => {
        insertResult = { data: null, error: { message: "new row violates row-level security policy" } };
        await saveNewTemplate();
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(screen.getByText("حفظ القالب")).toBeTruthy();
        expect((screen.getByPlaceholderText("مثلاً: تأكيد الطلب") as HTMLInputElement).value).toBe("Hi");
    });

    it("drops an order detail into the message with one click", async () => {
        listRows = [{ id: "t1", name: "تأكيد", content: "", content_ar: "هلا", is_active: true, template_type: "confirmation" }];
        renderList();
        await screen.findByDisplayValue("هلا");
        fireEvent.click(screen.getByText("اسم الزبون"));
        expect((screen.getByLabelText("نص الرسالة بالعربي") as HTMLTextAreaElement).value).toBe("هلا{customer_name}");
    });

    it("keeps the template and shows the error when the delete is refused", async () => {
        listRows = [{ id: "t9", name: "Old offer", content: "x", content_ar: "x", is_active: true, template_type: null }];
        deleteError = { message: "permission denied" };
        vi.spyOn(window, "confirm").mockReturnValue(true);
        renderList();
        await screen.findByText("Old offer");
        fireEvent.click(screen.getByText("احذف القالب"));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith("ما كدرنا نحذف القالب", "permission denied"));
        expect(screen.getByText("Old offer")).toBeTruthy();
    });
});
