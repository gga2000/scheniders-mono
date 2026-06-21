"use client";

import { useEffect, useId } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { parseActivityLog } from "@/lib/activity-parser";
import { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

export function GlobalActivityProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    // Per-instance channel name so a remount/double-mount doesn't hand back an
    // already-subscribed channel (which makes `.on()` throw "after subscribe()").
    const instanceId = useId();

    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`global-activity-stream:${instanceId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'activity_logs',
                },
                (payload: RealtimePostgresInsertPayload<any>) => {
                    const log = payload.new;

                    // Do not show toasts for actions performed by the current user
                    // (They already get local success toasts)
                    if (log.user_id === user.id) return;

                    // Parse the raw DB log into a human-readable notification
                    const notification = parseActivityLog(log);

                    if (notification) {
                        toast({
                            title: notification.title,
                            description: notification.description,
                            variant: notification.variant || "default",
                            duration: 6000,
                            // We use a special icon/avatar rendering in the parser
                            icon: notification.icon,
                        });
                    }
                }
            )
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') {
                    console.log('🌍 Global Activity Stream connected.');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, instanceId]);

    return <>{children}</>;
}
