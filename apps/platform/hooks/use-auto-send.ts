"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { authedFetch } from "@/lib/authed-fetch";

const KEY = ["settings", "auto-send"] as const;

async function fetchAutoSend(): Promise<boolean> {
    const res = await authedFetch("/api/settings/auto-send");
    if (!res.ok) throw new Error(`auto-send GET failed: ${res.status}`);
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { enabled?: unknown }).enabled === true;
}

async function putAutoSend(enabled: boolean): Promise<boolean> {
    const res = await authedFetch("/api/settings/auto-send", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error(`auto-send PUT failed: ${res.status}`);
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { enabled?: unknown }).enabled === true;
}

export function useAutoSend() {
    const qc = useQueryClient();
    const { t } = useLanguage();
    const { session } = useAuth();
    const accessToken = session?.access_token ?? "";
    const query = useQuery({
        queryKey: KEY,
        queryFn: fetchAutoSend,
        enabled: accessToken !== "",
        staleTime: 60_000,
    });
    const mutation = useMutation({
        mutationFn: putAutoSend,
        onSuccess: (enabled) => qc.setQueryData(KEY, enabled),
        onError: () => toast({ variant: "error", title: t("orders.autoSend.toggleFailed") }),
    });
    return {
        enabled: query.data ?? false,
        isLoading: query.isLoading,
        isToggling: mutation.isPending,
        // Unknown state (the read failed): don't guess, or a click on a toggle
        // shown OFF would switch a running auto-send off.
        toggle: () => {
            if (query.data !== undefined) mutation.mutate(!query.data);
        },
    };
}
