"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { followUpWindowSchema, DEFAULT_FOLLOW_UP_WINDOW, type FollowUpWindow } from "@/lib/follow-up-window";

const KEY = ["settings", "auto-send", "reminder"] as const;

const responseSchema = z.object({
    reminder_enabled: z.boolean().default(true),
    reminder_window: followUpWindowSchema.catch(DEFAULT_FOLLOW_UP_WINDOW),
});

export interface ReminderSettings {
    enabled: boolean;
    window: FollowUpWindow;
}

async function fetchReminder(accessToken: string): Promise<ReminderSettings> {
    const res = await fetch("/api/settings/auto-send", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`auto-send GET failed: ${res.status}`);
    const data = responseSchema.parse(await res.json());
    return { enabled: data.reminder_enabled, window: data.reminder_window };
}

async function putReminder(next: ReminderSettings, accessToken: string): Promise<ReminderSettings> {
    const res = await fetch("/api/settings/auto-send", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reminder_enabled: next.enabled, reminder_window: next.window }),
    });
    if (!res.ok) throw new Error(`auto-send PUT failed: ${res.status}`);
    const data = responseSchema.parse(await res.json());
    return { enabled: data.reminder_enabled, window: data.reminder_window };
}

export function useReminderSettings() {
    const qc = useQueryClient();
    const { session } = useAuth();
    const accessToken = session?.access_token ?? "";
    const query = useQuery({ queryKey: KEY, queryFn: () => fetchReminder(accessToken), enabled: accessToken !== "" });
    const mutation = useMutation({
        mutationFn: (next: ReminderSettings) => putReminder(next, accessToken),
        onSuccess: (saved) => qc.setQueryData(KEY, saved),
    });
    return { settings: query.data, isLoading: query.isLoading, isSaving: mutation.isPending, save: mutation.mutateAsync };
}
