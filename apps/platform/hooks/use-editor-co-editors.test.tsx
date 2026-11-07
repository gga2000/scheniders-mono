// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const presence = { otherUsers: [] as Array<{ display_name: string }> };
vi.mock("@/hooks/use-presence", () => ({ usePresence: () => presence }));

import { useEditorCoEditors } from "./use-editor-co-editors";

afterEach(() => {
    cleanup();
    presence.otherUsers = [];
});

describe("useEditorCoEditors", () => {
    it("names other team members who have the editor open", () => {
        presence.otherUsers = [{ display_name: "Noor" }];
        const { result } = renderHook(() => useEditorCoEditors("t1"));
        expect(result.current.others).toEqual(["Noor"]);
    });

    it("flags a second tab of the same browser, and clears when it closes", async () => {
        const a = renderHook(() => useEditorCoEditors("t1"));
        expect(a.result.current.otherTab).toBe(false);
        const b = renderHook(() => useEditorCoEditors("t1"));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(a.result.current.otherTab).toBe(true);
        expect(b.result.current.otherTab).toBe(true);
        b.unmount();
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(a.result.current.otherTab).toBe(false);
        a.unmount();
    });

    it("ignores tabs of a different store", async () => {
        const a = renderHook(() => useEditorCoEditors("t1"));
        const b = renderHook(() => useEditorCoEditors("t2"));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(a.result.current.otherTab).toBe(false);
        a.unmount();
        b.unmount();
    });
});
