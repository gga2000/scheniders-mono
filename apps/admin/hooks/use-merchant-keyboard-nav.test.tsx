// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { useMerchantKeyboardNav } from "./use-merchant-keyboard-nav";
import { useAdminStore } from "@/store/use-admin-store";

/*
 * Round 21 (UX new 8): Escape emptied the picked shops under an open bulk
 * dialog, which then read "0 selected merchants" and sent an empty list.
 */

const MERCHANTS = [{ id: "a" }, { id: "b" }];
const nav = (paused: boolean) =>
  renderHook(() => useMerchantKeyboardNav({ merchants: MERCHANTS, onOpenDetail: () => {}, onToggleShortcuts: () => {}, paused }));

afterEach(() => {
  cleanup();
  useAdminStore.getState().clearSelection();
});

describe("the Merchants list's keys", () => {
  it("clear the picked shops on Escape", () => {
    useAdminStore.getState().selectAllMerchants(["a", "b"]);
    nav(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useAdminStore.getState().selectedMerchants.size).toBe(0);
  });

  it("wait while a bulk step is open, so the picked shops stay", () => {
    useAdminStore.getState().selectAllMerchants(["a", "b"]);
    nav(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useAdminStore.getState().selectedMerchants.size).toBe(2);
  });
});
