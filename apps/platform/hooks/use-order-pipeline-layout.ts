"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useUserPreferences, PREFERENCE_KEYS } from "@/hooks/use-user-preferences";
import { isAdminRole } from "@/lib/permissions";
import {
    DEFAULT_PIPELINE_STAGES,
    normalizePipelineStages,
    type PipelineStageId,
} from "@/lib/order-pipeline";

/**
 * Resolves the order-pipeline stage layout for the current user, layering:
 *   userOverride (localStorage) ?? orgDefault (DB) ?? built-in default.
 *
 * - Any employee can personalize their own view (localStorage).
 * - Admins/owners can promote a layout to the tenant-wide default (DB) that
 *   every employee inherits when they have no personal override.
 */

const orgCacheKey = (tenantId: string) => `scheniders.order-pipeline-default.${tenantId}`;

function readOrgCache(tenantId: string | null): PipelineStageId[] | null {
    if (!tenantId || typeof window === "undefined") return null;
    try {
        return normalizePipelineStages(JSON.parse(localStorage.getItem(orgCacheKey(tenantId)) || "null"));
    } catch {
        return null;
    }
}

export interface OrderPipelineLayout {
    /** Effective ordered stage ids to render. */
    stages: PipelineStageId[];
    /** The tenant-wide default (null when never configured → built-in default). */
    orgDefault: PipelineStageId[] | null;
    /** Whether the current user has a personal override diverging from the org/default. */
    hasLocalOverride: boolean;
    /** True once preferences have hydrated on the client (avoids SSR flash). */
    ready: boolean;
    canSetDefault: boolean;
    isSavingDefault: boolean;
    /** Persist a personal layout for this user only. */
    setLocalStages: (stages: PipelineStageId[]) => void;
    /** Drop the personal override, reverting to the org/built-in default. */
    resetToDefault: () => void;
    /** Admin only: promote `stages` to the tenant-wide default for all employees. */
    saveAsTeamDefault: (stages: PipelineStageId[]) => Promise<void>;
}

export function useOrderPipelineLayout(): OrderPipelineLayout {
    const { session, role, tenantId } = useAuth();
    const { getPreference, setPreference, clearPreference, userId } = useUserPreferences();
    const queryClient = useQueryClient();

    const [localOverride, setLocalOverride] = useState<PipelineStageId[] | null>(null);
    const [hydrated, setHydrated] = useState(false);

    // Hydrate the personal override from localStorage once the user id is known.
    useEffect(() => {
        setLocalOverride(normalizePipelineStages(getPreference<PipelineStageId[]>(PREFERENCE_KEYS.ORDER_PIPELINE)));
        setHydrated(true);
    }, [getPreference, userId]);

    const orgQuery = useQuery({
        queryKey: ["order-pipeline-layout", tenantId],
        enabled: !!session?.access_token && !!tenantId,
        staleTime: 5 * 60_000,
        queryFn: async (): Promise<PipelineStageId[] | null> => {
            const res = await fetch("/api/settings/order-pipeline", {
                headers: { Authorization: `Bearer ${session!.access_token}` },
            });
            if (!res.ok) throw new Error("Failed to load pipeline layout");
            const json = (await res.json()) as { stages?: unknown };
            return normalizePipelineStages(json.stages);
        },
    });

    // Mirror the fetched org default into localStorage for instant first paint next time.
    useEffect(() => {
        if (orgQuery.data === undefined || !tenantId || typeof window === "undefined") return;
        try {
            localStorage.setItem(orgCacheKey(tenantId), JSON.stringify(orgQuery.data));
        } catch {
            /* ignore quota errors */
        }
    }, [orgQuery.data, tenantId]);

    const orgDefault = useMemo<PipelineStageId[] | null>(
        () => orgQuery.data ?? readOrgCache(tenantId),
        [orgQuery.data, tenantId],
    );

    const stages = useMemo<PipelineStageId[]>(
        () => localOverride ?? orgDefault ?? DEFAULT_PIPELINE_STAGES,
        [localOverride, orgDefault],
    );

    const saveMutation = useMutation({
        mutationFn: async (next: PipelineStageId[]) => {
            const res = await fetch("/api/settings/order-pipeline", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token ?? ""}`,
                },
                body: JSON.stringify({ stages: next }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Failed to save team default");
            }
            return normalizePipelineStages(((await res.json()) as { stages?: unknown }).stages);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["order-pipeline-layout", tenantId] });
        },
    });

    const setLocalStages = useCallback(
        (next: PipelineStageId[]) => {
            const normalized = normalizePipelineStages(next) ?? [];
            setLocalOverride(normalized);
            setPreference(PREFERENCE_KEYS.ORDER_PIPELINE, normalized, 0);
        },
        [setPreference],
    );

    const resetToDefault = useCallback(() => {
        setLocalOverride(null);
        clearPreference(PREFERENCE_KEYS.ORDER_PIPELINE);
    }, [clearPreference]);

    const saveAsTeamDefault = useCallback(
        async (next: PipelineStageId[]) => {
            await saveMutation.mutateAsync(normalizePipelineStages(next) ?? []);
            // Drop personal override so the admin sees the new shared default going forward.
            setLocalOverride(null);
            clearPreference(PREFERENCE_KEYS.ORDER_PIPELINE);
        },
        [saveMutation, clearPreference],
    );

    return {
        stages,
        orgDefault,
        hasLocalOverride: localOverride !== null,
        ready: hydrated,
        canSetDefault: isAdminRole(role),
        isSavingDefault: saveMutation.isPending,
        setLocalStages,
        resetToDefault,
        saveAsTeamDefault,
    };
}
