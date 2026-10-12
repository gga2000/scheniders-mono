// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Order } from "@/types/order";
import { useDuplicateDispatchGuard } from "./use-duplicate-dispatch-guard";

const order = (id: string, status: Order["status"]) => ({ id, order_id: id, status }) as Order;

const ready = order("ready", "confirmed");
const fresh = order("fresh", "new");
const twin = order("twin", "in_transit");
const twinOf = (id: string) => (id === "ready" || id === "fresh" ? twin : undefined);

describe("useDuplicateDispatchGuard", () => {
    it("holds a move to In Transit and replays it only on 'anyway'", () => {
        const { result } = renderHook(() => useDuplicateDispatchGuard([ready, fresh], twinOf));
        const proceed = vi.fn();

        let held = false;
        act(() => { held = result.current.holdStatusChange("ready", "in_transit", proceed); });

        expect(held).toBe(true);
        expect(proceed).not.toHaveBeenCalled();
        expect(result.current.dialogProps.open).toBe(true);
        expect(result.current.dialogProps.action).toBe("dispatch");
        expect(result.current.dialogProps.pairs.map(p => p.twin.id)).toEqual(["twin"]);

        act(() => result.current.dialogProps.onConfirmAnyway());
        expect(proceed).toHaveBeenCalledTimes(1);
    });

    it("holds a confirm with the confirm wording", () => {
        const { result } = renderHook(() => useDuplicateDispatchGuard([ready, fresh], twinOf));
        act(() => { result.current.holdStatusChange("fresh", "confirmed", vi.fn()); });
        expect(result.current.dialogProps.action).toBe("confirm");
    });

    it("lets statuses that cost nothing, and orders without a twin, straight through", () => {
        const { result } = renderHook(() => useDuplicateDispatchGuard([ready, fresh], twinOf));
        expect(result.current.holdStatusChange("ready", "cancelled", vi.fn())).toBe(false);
        expect(result.current.holdStatusChange("ready", "delivered", vi.fn())).toBe(false);
        expect(result.current.hold(["unknown"], "dispatch", vi.fn())).toBe(false);
        expect(result.current.dialogProps.open).toBe(false);
    });

    it("drops the held action when the dialog is dismissed", () => {
        const { result } = renderHook(() => useDuplicateDispatchGuard([ready, fresh], twinOf));
        const proceed = vi.fn();
        act(() => { result.current.hold(["ready", "fresh"], "dispatch", proceed); });
        expect(result.current.dialogProps.pairs).toHaveLength(2);

        act(() => result.current.dialogProps.onOpenChange(false));
        act(() => result.current.dialogProps.onConfirmAnyway());
        expect(proceed).not.toHaveBeenCalled();
    });
});
