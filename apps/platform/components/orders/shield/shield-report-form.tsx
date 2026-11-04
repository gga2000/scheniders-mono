"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@scheniders/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";

const MAX_NOTE = 500;

/**
 * "Report a wrong record" under the other-stores section of the Shield review.
 * The report waits for our reviewer; the record does not change on its own.
 * The database accepts it only for numbers that ordered from this store.
 */
export function ShieldReportForm({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");

    const send = useMutation({
        mutationFn: async (text: string) => {
            const { error } = await supabase.rpc("shield_report_wrong", { p_phone: phone, p_note: text });
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ variant: "success", title: t("shield.report.sent") });
            setOpen(false);
            setNote("");
        },
        onError: () => toast({ variant: "error", title: t("shield.report.failed") }),
    });

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="justify-self-start text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground">
                {t("shield.report.open")}
            </button>
        );
    }

    const text = note.trim();
    return (
        <form
            className="grid gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                if (text) send.mutate(text);
            }}
        >
            <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
                placeholder={t("shield.report.placeholder")}
                rows={3}
                className="text-sm"
                autoFocus
            />
            <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    {t("shield.report.cancel")}
                </button>
                <button
                    type="submit"
                    disabled={!text || send.isPending}
                    className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-(--background) disabled:opacity-50"
                >
                    {t("shield.report.send")}
                </button>
            </div>
        </form>
    );
}
