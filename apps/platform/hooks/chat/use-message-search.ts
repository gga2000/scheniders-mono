// apps/platform/hooks/chat/use-message-search.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { chatKeys } from "./use-conversations";
import type { ChatSearchResult } from "@/types/chat";

export function useMessageSearch(query: string) {
    const q = query.trim();
    return useQuery({
        queryKey: [...chatKeys.all, "search", q] as const,
        enabled: q.length >= 2,
        staleTime: 10_000,
        queryFn: async (): Promise<ChatSearchResult[]> => {
            const { data, error } = await supabase.rpc("chat_search_messages", { p_query: q, p_limit: 30 });
            if (error) throw error;
            return (data ?? []) as ChatSearchResult[];
        },
    });
}
