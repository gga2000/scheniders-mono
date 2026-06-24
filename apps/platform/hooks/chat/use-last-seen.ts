// apps/platform/hooks/chat/use-last-seen.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

/**
 * Fetches last_seen_at for a specific user from chat_user_status.
 * Cached with a 30-second staleTime — we don't need sub-second freshness here,
 * live online status comes from usePresenceStatus (the tenant presence store).
 */
export function useLastSeen(userId: string | null | undefined) {
    const { user } = useAuth();
    return useQuery({
        queryKey: ["chat", "last-seen", userId],
        enabled: !!user?.id && !!userId,
        staleTime: 30_000,
        queryFn: async (): Promise<string | null> => {
            if (!userId) return null;
            const { data, error } = await supabase
                .from("chat_user_status")
                .select("last_seen_at")
                .eq("user_id", userId)
                .maybeSingle();
            if (error) throw error;
            return (data as { last_seen_at: string | null } | null)?.last_seen_at ?? null;
        },
    });
}
