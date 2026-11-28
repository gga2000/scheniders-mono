"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";

const reminderKey = (userId: string | null) => ["password-reminder", userId] as const;

/**
 * A week after a weak password was accepted (lib/password-reminder.ts), a line
 * across the top asks its owner to pick a stronger one: change it now on the
 * new-password page, or be asked again in a week. Only the owner can read
 * their own reminder (RLS), so nobody else in the store ever sees it.
 */
export function PasswordReminderBanner() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const queryClient = useQueryClient();
    const [laterFailed, setLaterFailed] = useState(false);

    const { data: due } = useQuery({
        queryKey: reminderKey(userId),
        enabled: userId !== null,
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase.from("password_reminders").select("remind_at").maybeSingle();
            if (error) throw error;
            return data !== null && Date.parse(data.remind_at) <= Date.now();
        },
    });

    const later = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/auth/password-reminder", { method: "POST" });
            if (!res.ok) throw new Error(`password reminder snooze: ${res.status}`);
        },
        onMutate: () => setLaterFailed(false),
        onSuccess: () => queryClient.setQueryData(reminderKey(userId), false),
        onError: () => setLaterFailed(true),
    });

    if (!due) return null;

    return (
        <div role="status" data-testid="password-reminder-banner" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
            <p dir={dir} className="text-left">
                <span className="font-semibold">{t("pwremind.title")}.</span> {laterFailed ? t("pwremind.laterFailed") : t("pwremind.body")}
            </p>
            <div className="flex items-center gap-2">
                <Link href="/reset-password" className="rounded-lg bg-amber-800 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-900">
                    {t("pwremind.change")}
                </Link>
                <button
                    type="button"
                    onClick={() => later.mutate()}
                    disabled={later.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200 disabled:opacity-60"
                >
                    {later.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {t("pwremind.later")}
                </button>
            </div>
        </div>
    );
}
