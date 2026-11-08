"use client";

// =====================================================================
// useCapiKeys — the Conversions API send keys, through the lockbox
// =====================================================================
// The Meta / TikTok send keys live in `tenant_capi_secrets`, which no
// browser can read. The editor only learns whether a key is saved and its
// last four characters (capi_token_status), and saves, replaces or deletes
// one through set_capi_token (tenant admins only). A change applies to the
// live store right away: the keys are not part of the draft design.
// =====================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

export type CapiNetwork = "meta" | "tiktok";

export interface CapiKeyStatus {
    saved: boolean;
    last4: string | null;
}

export type CapiKeysStatus = Record<CapiNetwork, CapiKeyStatus>;

const EMPTY: CapiKeyStatus = { saved: false, last4: null };

export const capiKeysQueryKey = (tenantId: string) => ["capi-keys", tenantId] as const;

/** The RPC refused: the signed-in member is not an admin of this store. */
export class CapiKeyForbiddenError extends Error {
    constructor() {
        super("Only store admins can change Conversions API keys");
    }
}

const statusRowsSchema = z.array(
    z.object({
        network: z.string(),
        saved: z.boolean(),
        last4: z.string().nullable(),
    }),
);

async function fetchStatus(tenantId: string): Promise<CapiKeysStatus> {
    const { data, error } = await supabase.rpc("capi_token_status", { p_tenant_id: tenantId });
    if (error) throw error;
    const out: CapiKeysStatus = { meta: EMPTY, tiktok: EMPTY };
    for (const row of statusRowsSchema.parse(data ?? [])) {
        if (row.network === "meta" || row.network === "tiktok") {
            out[row.network] = { saved: row.saved, last4: row.saved ? row.last4 : null };
        }
    }
    return out;
}

export function useCapiKeys(tenantId: string) {
    const queryClient = useQueryClient();
    const key = capiKeysQueryKey(tenantId);

    const status = useQuery({
        queryKey: key,
        queryFn: () => fetchStatus(tenantId),
        staleTime: 60_000,
    });

    const save = useMutation({
        /** `token` null deletes the key. */
        mutationFn: async ({ network, token }: { network: CapiNetwork; token: string | null }) => {
            const { error } = await supabase.rpc("set_capi_token", {
                p_tenant_id: tenantId,
                p_network: network,
                // The RPC treats a blank token as "delete".
                p_token: token ?? "",
            });
            if (error?.code === "42501") throw new CapiKeyForbiddenError();
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    });

    return { status, save };
}
