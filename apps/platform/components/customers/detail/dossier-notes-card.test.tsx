// @vitest-environment jsdom
// Empty notes are one strip with its Add note button; a note keeps its own direction on the left.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CustomerNote } from "@/types/customer";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ language: "en", t: (key: string) => key }),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ role: "staff" }) }));
vi.mock("@/hooks/use-customer-notes", () => ({ useDeleteCustomerNote: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { DossierNotesCard } from "./dossier-notes-card";

afterEach(cleanup);

describe("DossierNotesCard", () => {
    it("is one strip while empty, with the Add note action", () => {
        const onAddNote = vi.fn();
        const { container } = render(<DossierNotesCard notes={[]} onAddNote={onAddNote} />);
        expect(screen.getByText("customers.profile.noNotes")).toBeTruthy();
        // The strip has no heading block and no list: a single row.
        expect(container.querySelector("h3, .space-y-2\\.5")).toBeNull();
        expect(container.firstElementChild?.className).toContain("h-14");
        fireEvent.click(screen.getByText("customers.profile.addNote"));
        expect(onAddNote).toHaveBeenCalledTimes(1);
    });

    it("writes a note with dir=auto on the left, like the drawer", () => {
        const note = { id: "n1", note: "اتصل قبل التوصيل", created_at: "2026-10-30T10:00:00Z", created_by: "me" } as CustomerNote;
        render(<DossierNotesCard notes={[note]} />);
        const text = screen.getByText("اتصل قبل التوصيل");
        expect(text.getAttribute("dir")).toBe("auto");
        expect(text.className).toContain("text-left");
    });
});
