// @vitest-environment jsdom
// The dialog must tell three outcomes apart: no earlier versions, earlier
// versions, and a failed read. A failed read rendering as "never edited" is
// the silent failure this guards against.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { MessageEdit } from "@/hooks/chat/use-message-edits";

const refetch = vi.fn();
const editsState = {
    data: undefined as MessageEdit[] | undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch,
};
const useMessageEdits = vi.fn<(messageId: string | null, enabled: boolean) => typeof editsState>(
    () => editsState,
);

vi.mock("@/hooks/chat/use-message-edits", () => ({
    useMessageEdits: (messageId: string | null, enabled: boolean) => useMessageEdits(messageId, enabled),
}));

// Radix portals and focus-traps; the dialog's contents are what's under test.
vi.mock("@scheniders/ui", () => ({
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/providers/language-provider", () => ({
    useLanguage: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

import { EditHistoryDialog } from "./edit-history-dialog";

beforeEach(() => {
    editsState.data = undefined;
    editsState.isLoading = false;
    editsState.isError = false;
    editsState.isFetching = false;
    refetch.mockClear();
    useMessageEdits.mockClear();
});
afterEach(cleanup);

describe("EditHistoryDialog", () => {
    it("does not query or render while closed", () => {
        const { container } = render(<EditHistoryDialog messageId={null} currentBody="now" onClose={() => {}} />);
        expect(container.textContent).toBe("");
        expect(useMessageEdits).toHaveBeenCalledWith(null, false);
    });

    it("shows the current body and each earlier version, newest first", () => {
        editsState.data = [
            { id: "e2", prev_body: "second draft", edited_at: "2026-10-18T10:00:00Z" },
            { id: "e1", prev_body: "first draft", edited_at: "2026-10-18T09:00:00Z" },
        ];
        render(<EditHistoryDialog messageId="m1" currentBody="final text" onClose={() => {}} />);
        expect(useMessageEdits).toHaveBeenCalledWith("m1", true);
        expect(screen.getByText("final text")).toBeTruthy();
        const versions = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
        expect(versions).toHaveLength(2);
        expect(versions[0]).toContain("second draft");
        expect(versions[1]).toContain("first draft");
    });

    it("shows the empty state when there are no earlier versions", () => {
        editsState.data = [];
        render(<EditHistoryDialog messageId="m1" currentBody="final text" onClose={() => {}} />);
        expect(screen.getByText("No earlier versions")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("reports a failed read instead of claiming the message was never edited", () => {
        editsState.isError = true;
        render(<EditHistoryDialog messageId="m1" currentBody="final text" onClose={() => {}} />);
        expect(screen.getByRole("alert").textContent).toContain("Couldn't load earlier versions");
        expect(screen.queryByText("No earlier versions")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(refetch).toHaveBeenCalledTimes(1);
    });
});
