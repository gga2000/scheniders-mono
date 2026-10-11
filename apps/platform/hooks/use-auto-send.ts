"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";

const KEY = ["settings", "auto-send"] as const;

async function fetchAutoSend(accessToken: string): Promise<boolean> {
    const res = await fetch("/api/settings/auto-send", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`auto-send GET failed: ${res.status}`);
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { enabled?: unknown }).enabled === true;
}

async function putAutoSend(enabled: boolean, accessToken: string): Promise<boolean> {
    const res = await fetch("/api/settings/auto-send", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error(`auto-send PUT failed: ${res.status}`);
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { enabled?: unknown }).enabled === true;
}

export function useAutoSend() {
    const qc = useQueryClient();
    const { session } = useAuth();
    const accessToken = session?.access_token ?? "";
    const query = useQuery({
        queryKey: KEY,
        queryFn: () => fetchAutoSend(accessToken),
        enabled: accessToken !== "",
        staleTime: 60_000,
    });
    const mutation = useMutation({
        mutationFn: (enabled: boolean) => putAutoSend(enabled, accessToken),
        onSuccess: (enabled) => qc.setQueryData(KEY, enabled),
    });
    return {
        enabled: query.data ?? false,
        isLoading: query.isLoading,
        isToggling: mutation.isPending,
        toggle: () => mutation.mutate(!(query.data ?? false)),
    };
}
