// apps/platform/hooks/chat/use-unread-inbox.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { userInboxTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";

// Subscribes to the per-user inbox topic; on any new message, refresh conversation list
// (which recomputes unread). Returns nothing; mount once high in the tree.
export function useUnreadInbox() {
    const { user } = useAuth();
    const qc = useQueryClient();
    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase.channel(userInboxTopic(user.id), { config: { private: true } });
        channel
            .on("broadcast", { event: "inbox:new" }, ({ payload }) => {
                if ((payload as { sender_id?: string }).sender_id === user.id) return;
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .on("broadcast", { event: "inbox:refresh" }, () => {
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, qc]);
}
