"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { UnfurlResult } from "@/types/chat";

/**
 * Lazily unfurl a single URL via the SSRF-guarded `/api/chat/unfurl` route.
 *
 * - Only runs when a URL is present and the user is authenticated.
 * - Long `staleTime` (link metadata rarely changes); cached per URL.
 * - The route degrades gracefully to an all-null payload on any failure or
 *   blocked host, so this hook never surfaces an error to the UI — the
 *   preview card simply renders nothing when there's no title/image.
 */
export function useUnfurl(url: string | null | undefined) {
    const { session } = useAuth();
    const token = session?.access_token;

    return useQuery<UnfurlResult>({
        queryKey: ["chat", "unfurl", url],
        enabled: !!url && !!token,
        staleTime: 60 * 60_000, // 1 hour
        gcTime: 60 * 60_000,
        retry: false,
        queryFn: async (): Promise<UnfurlResult> => {
            const res = await fetch(`/api/chat/unfurl?url=${encodeURIComponent(url!)}`, {
                headers: { Authorization: `Bearer ${token!}` },
            });
            if (!res.ok) {
                // The route returns 200 for blocked/failed unfurls; a non-200
                // here means auth/transport — degrade to an empty preview.
                return { url: url!, title: null, description: null, image: null };
            }
            return (await res.json()) as UnfurlResult;
        },
    });
}
