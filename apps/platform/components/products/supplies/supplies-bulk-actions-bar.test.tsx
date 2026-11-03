import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Product } from "@/lib/supabase";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

import { SuppliesBulkActionsBar } from "./supplies-bulk-actions-bar";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const supplies = [{ id: "s1", name: "Box" }, { id: "s2", name: "Tape" }] as Product[];

const renderBar = (setFields: (ids: string[], patch: object) => Promise<void>, onClear = vi.fn()) =>
    render(
        <SuppliesBulkActionsBar
            selected={supplies}
            categories={[]}
            onClear={onClear}
            setFields={setFields}
            adjustStock={vi.fn()}
        />,
    );

describe("SuppliesBulkActionsBar archive", () => {
    it("archives the whole selection in one call", async () => {
        const setFields = vi.fn().mockResolvedValue(undefined);
        const onClear = vi.fn();
        renderBar(setFields, onClear);
        fireEvent.click(screen.getByTitle("supplies.bulk.archiveSelected"));
        await waitFor(() => expect(onClear).toHaveBeenCalled());
        expect(setFields).toHaveBeenCalledTimes(1);
        expect(setFields).toHaveBeenCalledWith(["s1", "s2"], { is_archived: true });
        expect(toast.success).toHaveBeenCalled();
    });

    it("keeps the selection and says nothing changed when the call fails", async () => {
        const onClear = vi.fn();
        renderBar(vi.fn().mockRejectedValue(new Error("offline")), onClear);
        fireEvent.click(screen.getByTitle("supplies.bulk.archiveSelected"));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(onClear).not.toHaveBeenCalled();
    });
});
