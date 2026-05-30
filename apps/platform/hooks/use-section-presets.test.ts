/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/* ─────────────────────────────────────────────────────────────────── */
/* Mock the supabase singleton.                                         */
/* ─────────────────────────────────────────────────────────────────── */

interface FakeRow {
    id: string;
    tenant_id: string;
    name: string;
    section_type: string;
    instance: Record<string, unknown>;
    created_at: string;
}

let STORE: FakeRow[] = [];

function makeFakeClient() {
    return {
        from: (_table: string) => ({
            select: (_cols: string) => {
                const filterChain = {
                    rows: STORE.slice(),
                    eq(_col: string, val: string) {
                        this.rows = this.rows.filter((r) => r.tenant_id === val);
                        return this;
                    },
                    order(_col: string, _opts: { ascending: boolean }) {
                        return Promise.resolve({ data: this.rows, error: null });
                    },
                    single() {
                        return Promise.resolve({ data: this.rows[0], error: null });
                    },
                };
                return filterChain;
            },
            insert: (row: Omit<FakeRow, "id" | "created_at">) => ({
                select: (_cols: string) => ({
                    single: () => {
                        const inserted: FakeRow = {
                            id: `pre_${STORE.length + 1}`,
                            created_at: new Date(2026, 4, 16).toISOString(),
                            ...row,
                        };
                        STORE.push(inserted);
                        return Promise.resolve({ data: inserted, error: null });
                    },
                }),
            }),
            delete: () => ({
                eq: (_col: string, val: string) => {
                    STORE = STORE.filter((r) => r.id !== val);
                    return Promise.resolve({ data: null, error: null });
                },
            }),
        }),
    };
}

vi.mock("@/lib/supabase", () => ({
    supabase: makeFakeClient(),
}));

import {
    useSectionPresets,
    instantiatePreset,
    stripInstanceForPreset,
    type SectionPresetRow,
} from "./use-section-presets";
import type { SectionInstance } from "@scheniders/shared";

beforeEach(() => {
    STORE = [];
});

const TENANT = "tenant-abc";

function makeInstance(overrides: Partial<SectionInstance> = {}): SectionInstance {
    return {
        id: "sec-1",
        type: "hero_image",
        enabled: true,
        base: { title_i18n: { en: "hi" } },
        ...overrides,
    };
}

describe("useSectionPresets", () => {
    it("create() inserts a preset stripped of its instance id and lists it back", async () => {
        const { result } = renderHook(() => useSectionPresets(TENANT));
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        let created: SectionPresetRow | null = null;
        await act(async () => {
            created = await result.current.create("Big hero", makeInstance());
        });
        expect(created).not.toBeNull();
        expect(created!.name).toBe("Big hero");
        expect(created!.section_type).toBe("hero_image");
        // No id in the stored instance — only on the row.
        expect((created!.instance as Record<string, unknown>).id).toBeUndefined();
        // List reflects the new preset.
        expect(result.current.presets).toHaveLength(1);
        expect(result.current.presets[0].name).toBe("Big hero");
    });

    it("remove() deletes a preset and drops it from the local list", async () => {
        const { result } = renderHook(() => useSectionPresets(TENANT));
        await waitFor(() => expect(result.current.loading).toBe(false));
        let row: SectionPresetRow | null = null;
        await act(async () => {
            row = await result.current.create("p1", makeInstance());
        });
        expect(result.current.presets).toHaveLength(1);
        let ok = false;
        await act(async () => {
            ok = await result.current.remove(row!.id);
        });
        expect(ok).toBe(true);
        expect(result.current.presets).toHaveLength(0);
    });

    it("instantiatePreset() rehashes id and deep-clones so reapplying produces fresh sections", async () => {
        const { result } = renderHook(() => useSectionPresets(TENANT));
        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => {
            await result.current.create("p1", makeInstance({
                label: "Stored",
                variants: [
                    {
                        id: "v1",
                        label: "AR",
                        conditions: [{ kind: "locale", values: ["ar"] }],
                        override: { title_i18n: { ar: "مرحبا" } },
                        priority: 1,
                    },
                ],
            }));
        });
        const row = result.current.presets[0];
        const a = instantiatePreset(row);
        const b = instantiatePreset(row);
        expect(a.id).not.toBe(b.id);
        expect(a.id.startsWith("__")).toBe(false);
        expect(a.label).toBe("Stored");
        expect(a.variants?.[0].override).not.toBe(b.variants?.[0].override);
        // Mutating result does not bleed back into the row.
        (a.base as Record<string, unknown>).title_i18n = { en: "edited" };
        expect((row.instance.base as Record<string, unknown>).title_i18n).toEqual({
            en: "hi",
        });
    });
});

describe("stripInstanceForPreset", () => {
    it("removes the id while preserving everything else", () => {
        const inst: SectionInstance = {
            id: "to-be-removed",
            type: "trust_strip",
            enabled: true,
            base: { pills: [{ label_i18n: { en: "COD" } }] },
            label: "Trust",
        };
        const out = stripInstanceForPreset(inst);
        expect((out as Record<string, unknown>).id).toBeUndefined();
        expect(out.type).toBe("trust_strip");
        expect(out.label).toBe("Trust");
    });
});
