"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { primeShipmentsKey } from "@/hooks/use-prime-shipments";

const answerSchema = z.object({ success: z.boolean(), connected: z.boolean().optional(), error: z.string().optional() });

/** Read Prime's status now (POST /api/prime/refresh); the Prime views reload after. True when Prime answered. */
export function usePrimeRefresh() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(async (): Promise<boolean> => {
        if (!token) throw new Error("Not signed in");
        const res = await fetch("/api/prime/refresh", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const answer = answerSchema.parse(await res.json().catch(() => ({ success: false })));
        await queryClient.invalidateQueries({ queryKey: primeShipmentsKey(tenantId) });
        return res.ok && answer.success;
    }, [token, tenantId, queryClient]);
}
