"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";

/** Admin-only form: the token goes straight to the server route and is never read back. */
export function MetaAdsConnectCard() {
    const { t } = useLanguage();
    const { session } = useAuth();
    const qc = useQueryClient();
    const [adAccountId, setAdAccountId] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [usdToIqd, setUsdToIqd] = useState("1717");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/settings/meta-ads", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
                body: JSON.stringify({ adAccountId: adAccountId.trim().replace(/^act_/, ""), accessToken: accessToken.trim(), usdToIqd: Number(usdToIqd) }),
            });
            const body = (await res.json()) as { success?: boolean; error?: string };
            if (!body.success) setError(body.error ?? "Failed");
            await qc.invalidateQueries({ queryKey: ["meta-ads"] });
            if (body.success) setAccessToken("");
        } finally {
            setBusy(false);
        }
    }

    const input = "w-full rounded-xl border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm";
    return (
        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("ads.connectTitle")}</h2>
            <input className={input} placeholder={t("ads.adAccountId")} value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} required />
            <input className={input} type="password" autoComplete="off" placeholder={t("ads.accessToken")} value={accessToken} onChange={(e) => setAccessToken(e.target.value)} required />
            <input className={input} type="number" min={1000} max={3000} placeholder="USD → IQD" value={usdToIqd} onChange={(e) => setUsdToIqd(e.target.value)} required />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button type="submit" disabled={busy} className="rounded-xl bg-foreground px-4 py-2 text-sm text-background disabled:opacity-60">
                {t("ads.connect")}
            </button>
        </form>
    );
}
