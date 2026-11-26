"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { authedFetch } from "@/lib/authed-fetch";

const savedSchema = z.object({
    success: z.literal(true),
    saved: z.object({ loginId: z.string(), password: z.string().optional() }).nullable(),
});

async function readSaved(reveal: boolean) {
    const res = await authedFetch(`/api/prime/saved-login${reveal ? "?reveal=1" : ""}`);
    if (!res.ok) throw new Error(`Prime saved login failed: ${res.status}`);
    return savedSchema.parse(await res.json()).saved;
}

/**
 * «حساب دخولك لتطبيق برايم»: the Prime app login and password the store picked
 * when it asked us for its Prime account, kept so the owner can look them up.
 * The password is fetched only when the owner presses Show, and dropped from
 * the page when they press Hide. Nothing shows for a store that has none.
 */
export function PrimeSavedLogin() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { tenantId, role } = useAuth();
    const [shown, setShown] = useState(false);
    const [copied, setCopied] = useState<"login" | "password" | null>(null);

    const saved = useQuery({
        queryKey: ["prime-link", "saved-login", tenantId ?? ""],
        enabled: !!tenantId,
        queryFn: () => readSaved(false),
    });
    const revealed = useQuery({
        queryKey: ["prime-link", "saved-login", tenantId ?? "", "reveal"],
        enabled: !!tenantId && shown,
        queryFn: () => readSaved(true),
        gcTime: 0,
        staleTime: 0,
    });

    if (!saved.data) return null;
    const owner = role === "admin";
    const password = shown ? revealed.data?.password : undefined;

    const copy = async (what: "login" | "password", text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(what);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            setCopied(null);
        }
    };

    const ROW = "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm";
    const MINI = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-2.5 text-xs font-medium text-foreground hover:bg-[var(--background)]";

    return (
        <section aria-labelledby="prime-saved-login" className="grid gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted" aria-hidden="true" />
                <h2 id="prime-saved-login" dir={dir} className="text-sm font-semibold text-foreground">{t("prime.link.saved.title")}</h2>
                <span dir={dir} className="ms-auto text-xs text-muted">{t("prime.link.saved.ownerOnly")}</span>
            </div>
            <div className={ROW}>
                <span dir={dir} className="text-muted">{t("prime.link.new.loginId")}</span>
                <span className="font-semibold tabular-nums text-foreground">{saved.data.loginId}</span>
                <button type="button" className={MINI} onClick={() => void copy("login", saved.data?.loginId ?? "")}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(copied === "login" ? "prime.link.saved.copied" : "prime.link.saved.copy")}
                </button>
            </div>
            {owner && (
                <div className={ROW}>
                    <span dir={dir} className="text-muted">{t("prime.link.new.password")}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                        {shown && revealed.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : (password ?? "••••••••")}
                    </span>
                    <span className="flex gap-1.5">
                        {password && (
                            <button type="button" className={MINI} onClick={() => void copy("password", password)}>
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                {t(copied === "password" ? "prime.link.saved.copied" : "prime.link.saved.copy")}
                            </button>
                        )}
                        <button type="button" className={MINI} onClick={() => setShown((v) => !v)}>
                            {shown ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                            {t(shown ? "prime.link.saved.hide" : "prime.link.saved.show")}
                        </button>
                    </span>
                </div>
            )}
            {revealed.isError && (
                <span dir={dir} role="alert" className="text-xs text-red-600">{t("prime.link.saved.failed")}</span>
            )}
        </section>
    );
}
