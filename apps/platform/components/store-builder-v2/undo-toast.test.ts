/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from "vitest";

const toastMock = vi.fn((_arg: unknown) => "toast-1");
const dismissMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
    toast: (arg: unknown) => toastMock(arg),
    dismissToast: (id: string) => dismissMock(id),
}));

import { removeWithUndo } from "./undo-toast";

type Action = { action: { label: string; onClick: () => void } };

beforeEach(() => {
    toastMock.mockClear();
    dismissMock.mockClear();
});

describe("removeWithUndo", () => {
    it("removes the row, and restoring puts it back in place and closes the toast", () => {
        const set = vi.fn();
        removeWithUndo(["a", "b", "c"], 1, set, { title: "removed", hint: "hint", restoreLabel: "restore" });
        expect(set).toHaveBeenLastCalledWith(["a", "c"]);
        const arg = toastMock.mock.calls[0][0] as Action;
        expect(arg.action.label).toBe("restore");
        arg.action.onClick();
        expect(set).toHaveBeenLastCalledWith(["a", "b", "c"]);
        expect(dismissMock).toHaveBeenCalledWith("toast-1");
    });
});
