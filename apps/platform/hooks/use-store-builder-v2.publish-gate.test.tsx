// The Publish button is driven by `has_unpublished_changes`. These cases pin
// the three reasons it may legitimately be enabled on mount, because getting
// this wrong strands a merchant on a disabled button with no explanation and
// no obvious way out.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { StoreConfigV2 } from "@scheniders/shared";
import { useStoreBuilderV2 } from "./use-store-builder-v2";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  }),
}));

const config = (): StoreConfigV2 =>
  ({
    schema_version: 2,
    default_locale: "ar",
    enabled_locales: ["ar"],
    pages: [{ page_id: "home", sections: [] }],
  }) as unknown as StoreConfigV2;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publish gate — has_unpublished_changes on mount", () => {
  it("stays enabled when a published store has an unpublished draft", () => {
    // The regression: `initialConfig` IS the draft, so the dirty effect
    // compares it against itself, finds no diff, and used to flip the
    // correct initiallyDirty state back to false — stranding any merchant
    // with saved-but-unpublished work on a dead Publish button.
    const { result } = renderHook(() =>
      useStoreBuilderV2({
        tenantId: "t1",
        slug: "test-store",
        initialConfig: config(),
        hasPublished: true,
        initiallyDirty: true,
      }),
    );
    expect(result.current.has_unpublished_changes).toBe(true);
  });

  it("stays enabled for a never-published store", () => {
    const { result } = renderHook(() =>
      useStoreBuilderV2({
        tenantId: "t1",
        slug: "test-store",
        initialConfig: config(),
        hasPublished: false,
        initiallyDirty: false,
      }),
    );
    expect(result.current.has_unpublished_changes).toBe(true);
  });

  it("is disabled when a published store has no draft and no edits", () => {
    // The one case that SHOULD disable Publish: nothing to publish.
    const { result } = renderHook(() =>
      useStoreBuilderV2({
        tenantId: "t1",
        slug: "test-store",
        initialConfig: config(),
        hasPublished: true,
        initiallyDirty: false,
      }),
    );
    expect(result.current.has_unpublished_changes).toBe(false);
  });
});
