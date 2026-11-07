// A structural edit followed by a field patch inside the debounce window must
// still reach the DB draft: patchField persists only its own field, so the
// structural edit's armed full save may not be dropped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { StoreConfigV2 } from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import { useStoreBuilderV2 } from "./use-store-builder-v2";

const update = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({
      update: (row: unknown) => {
        update(row);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  },
}));

const config = (): StoreConfigV2 =>
  ({
    schema_version: 2,
    default_locale: "ar",
    enabled_locales: ["ar"],
    pages: [{ page_id: "home", sections: [] }],
    brand: { name: "a" },
  }) as unknown as StoreConfigV2;

beforeEach(() => {
  vi.useFakeTimers();
  update.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("builder autosave", () => {
  it("still saves a structural edit when a field patch follows within the debounce", async () => {
    const { result } = renderHook(() =>
      useStoreBuilderV2({
        tenantId: "t1",
        slug: "s",
        initialConfig: config(),
        hasPublished: true,
        initiallyDirty: false,
      }),
    );

    act(() => {
      result.current.setConfig((prev) => ({ ...prev, default_locale: "en" }) as StoreConfigV2, "structural");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => {
      result.current.patchField(["brand", "name"], "b");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(update).toHaveBeenCalledTimes(1);
    const saved = update.mock.calls[0]?.[0] as { store_config_v2_draft: Record<string, unknown> };
    expect(saved.store_config_v2_draft.default_locale).toBe("en");
    expect((saved.store_config_v2_draft.brand as { name: string }).name).toBe("b");
  });

  const render = () =>
    renderHook(() =>
      useStoreBuilderV2({
        tenantId: "t1",
        slug: "s",
        initialConfig: config(),
        hasPublished: true,
        initiallyDirty: false,
      }),
    );

  it("saves the undo back to the loaded config instead of keeping the edit in the draft", async () => {
    const { result } = render();

    act(() => {
      result.current.setConfig((prev) => ({ ...prev, default_locale: "en" }) as StoreConfigV2, "structural");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(update).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.undo();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.config.default_locale).toBe("ar");
    expect(update).toHaveBeenCalledTimes(2);
    const saved = update.mock.calls[1]?.[0] as { store_config_v2_draft: Record<string, unknown> };
    expect(saved.store_config_v2_draft.default_locale).toBe("ar");
  });

  it("undo right after an edit (inside the history debounce) reverts that edit", async () => {
    const { result } = render();

    act(() => {
      result.current.setConfig((prev) => ({ ...prev, default_locale: "en" }) as StoreConfigV2, "structural");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.config.default_locale).toBe("ar");

    // A later edit still records history normally after the undo.
    act(() => {
      result.current.setConfig((prev) => ({ ...prev, default_locale: "en" }) as StoreConfigV2, "structural");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.config.default_locale).toBe("ar");
  });

  it("tells the publish sheet why a publish failed", async () => {
    const rpc = vi.mocked(supabase.rpc);
    const { result } = render();

    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "config_conflict" } } as never);
    let ok = true;
    await act(async () => {
      ok = await result.current.publish();
    });
    expect(ok).toBe(false);
    expect(result.current.publish_error).toBe("conflict");

    rpc.mockResolvedValueOnce({ data: null, error: { code: "500", message: "boom" } } as never);
    await act(async () => {
      ok = await result.current.publish();
    });
    expect(result.current.publish_error).toBe("failed");

    await act(async () => {
      ok = await result.current.publish();
    });
    expect(ok).toBe(true);
    expect(result.current.publish_error).toBeNull();
  });
});
