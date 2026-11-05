"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";

const answerSchema = z.object({ success: z.literal(true), enabled: z.boolean() });
const key = (tenantId: string | null | undefined) => ["prime-failed-notice", tenantId] as const;

/** The store's switch for the failed-delivery WhatsApp (GET/PUT /api/prime/failed-notice). */
export function usePrimeFailedNotice() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token ?? "";
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: key(tenantId),
        enabled: token !== "",
        queryFn: async () => {
            const res = await fetch("/api/prime/failed-notice", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Failed-delivery WhatsApp setting failed: ${res.status}`);
            return answerSchema.parse(await res.json()).enabled;
        },
    });
    const mutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            const res = await fetch("/api/prime/failed-notice", {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ enabled }),
            });
            if (!res.ok) throw new Error(`Saving the failed-delivery WhatsApp setting failed: ${res.status}`);
            return answerSchema.parse(await res.json()).enabled;
        },
        onSuccess: (enabled) => queryClient.setQueryData(key(tenantId), enabled),
    });
    return { enabled: query.data ?? false, loaded: query.isSuccess, saving: mutation.isPending, setEnabled: mutation.mutateAsync };
}
