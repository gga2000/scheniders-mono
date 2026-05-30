"use client";

// =====================================================================
// useSectionPresets — per-tenant library of reusable section configs
// =====================================================================
// Reads/writes the `store_section_presets` table via the Supabase
// client. The hook is intentionally small: list, create, delete. Updates
// (rename) aren't part of the v1 surface — merchants can delete and
// recreate.
//
// The `SectionInstancePreset` shape is everything from `SectionInstance`
// except `id` — the id is rehashed each time a preset is inserted onto
// a page.
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import type { SectionInstance } from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import {
    instantiatePreset as _instantiatePreset,
    stripInstanceForPreset,
    type SectionInstancePreset,
    type SectionPresetRow,
} from "@/lib/section-presets-util";

/* ─────────────────────────────────────────────────────────────────── */
/* Re-exports — keep the existing import paths working                  */
/* ─────────────────────────────────────────────────────────────────── */

export {
    stripInstanceForPreset,
    type SectionInstancePreset,
    type SectionPresetRow,
};
export const instantiatePreset = _instantiatePreset;

export interface UseSectionPresetsReturn {
    presets: SectionPresetRow[];
    loading: boolean;
    error: string | null;
    /** Refetch from the server. */
    refresh: () => Promise<void>;
    /** Persist a new preset. Returns the row id, or null on failure. */
    create: (
        name: string,
        instance: SectionInstance,
    ) => Promise<SectionPresetRow | null>;
    /** Hard-delete a preset. Returns true on success. */
    remove: (id: string) => Promise<boolean>;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Hook                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

const TABLE = "store_section_presets";

export function useSectionPresets(tenantId: string | undefined): UseSectionPresetsReturn {
    const [presets, setPresets] = useState<SectionPresetRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (): Promise<void> => {
        if (!tenantId) {
            setPresets([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: err } = await supabase
                .from(TABLE)
                .select("id, tenant_id, name, section_type, instance, created_at")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false });
            if (err) {
                setError(err.message);
                return;
            }
            setPresets((data ?? []) as SectionPresetRow[]);
        } catch (e) {
            // Network failure / stubbed client / RLS — degrade to empty.
            setError(e instanceof Error ? e.message : String(e));
            setPresets([]);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const create = useCallback(
        async (
            name: string,
            instance: SectionInstance,
        ): Promise<SectionPresetRow | null> => {
            if (!tenantId) {
                setError("Missing tenant id");
                return null;
            }
            const row = {
                tenant_id: tenantId,
                name: name.trim(),
                section_type: instance.type,
                instance: stripInstanceForPreset(instance),
            };
            const { data, error: err } = await supabase
                .from(TABLE)
                .insert(row)
                .select("id, tenant_id, name, section_type, instance, created_at")
                .single();
            if (err || !data) {
                setError(err?.message ?? "Failed to create preset");
                return null;
            }
            const created = data as SectionPresetRow;
            setPresets((curr) => [created, ...curr]);
            return created;
        },
        [tenantId],
    );

    const remove = useCallback(
        async (id: string): Promise<boolean> => {
            const { error: err } = await supabase
                .from(TABLE)
                .delete()
                .eq("id", id);
            if (err) {
                setError(err.message);
                return false;
            }
            setPresets((curr) => curr.filter((p) => p.id !== id));
            return true;
        },
        [],
    );

    return { presets, loading, error, refresh, create, remove };
}

