"use client";

// =====================================================================
// PairAnswer: «تفتح حسابك على هذا الكمبيوتر؟» on the phone
// =====================================================================
// The code on a computer's sign-in page opens this (lib/computer-sign-in.ts).
// It names the computer (browser, system, and its country when that is not
// Iraq) and asks once. Yes signs that computer in as this person; the page
// warns plainly against codes someone sent, the one way this is abused.
// Signed out here, the person signs in first and comes back.
// =====================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Laptop, Loader2, X } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useStoreName } from "@/hooks/use-store-name";
import { authedFetch } from "@/lib/authed-fetch";
import { computerSignInPath } from "@/lib/computer-sign-in";
import { rememberComputerOpened } from "@/lib/computer-setup-hints";

const detailSchema = z.object({
    success: z.literal(true),
    data: z.object({
        browser: z.string(),
        os: z.string(),
        country: z.string().nullable(),
        created_at: z.string(),
        state: z.enum(["waiting", "approved", "declined", "expired", "used"]),
    }),
});
type Detail = z.infer<typeof detailSchema>["data"];

class GoneError extends Error {}

async function readDetail(id: string): Promise<Detail> {
    const res = await authedFetch(`/api/auth/computer-sign-in/${id}`);
    if (res.status === 410) throw new GoneError("expired");
    if (!res.ok) throw new Error(`computer sign-in look failed: HTTP ${res.status}`);
    return detailSchema.parse(await res.json()).data;
}

async function sendAnswer(id: string, answer: "yes" | "no"): Promise<"yes" | "no"> {
    const res = await authedFetch(`/api/auth/computer-sign-in/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
    });
    if (res.status === 410) throw new GoneError("expired");
    if (!res.ok) throw new Error(`computer sign-in answer failed: HTTP ${res.status}`);
    return answer;
}

function regionName(country: string, language: string): string {
    return new Intl.DisplayNames([language], { type: "region" }).of(country) ?? country;
}

export function PairAnswer({ id }: { id: string }) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const { user, tenantId, isLoading } = useAuth();
    const { data: shopName } = useStoreName(user ? tenantId : null);
    const [now] = useState(() => Date.now());

    // Signed out on this phone (the camera opened another browser): sign in, then back here.
    useEffect(() => {
        if (!isLoading && !user) router.replace(`/login?returnTo=${encodeURIComponent(computerSignInPath(id))}`);
    }, [isLoading, user, router, id]);

    const detail = useQuery({
        queryKey: ["computer-sign-in", id],
        queryFn: () => readDetail(id),
        enabled: !!user,
        retry: (count, error) => !(error instanceof GoneError) && count < 2,
        staleTime: Infinity,
    });
    const answer = useMutation({
        mutationFn: (choice: "yes" | "no") => sendAnswer(id, choice),
        onSuccess: (choice) => {
            if (choice === "yes") rememberComputerOpened();
        },
    });

    const backToApp = () => router.push("/orders");

    if (isLoading || !user || detail.isPending) {
        return (
            <div role="status" className="flex items-center justify-center gap-2 py-16 text-[14px] text-[#8A847A]">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                {t("pair.loading")}
            </div>
        );
    }

    const expired =
        detail.error instanceof GoneError ||
        answer.error instanceof GoneError ||
        (detail.data !== undefined && detail.data.state !== "waiting" && !answer.isSuccess);

    if (answer.isSuccess || expired) {
        const opened = answer.data === "yes";
        const title = opened ? t("pair.opened.title") : answer.data === "no" ? t("pair.declined.title") : t("pair.expired.title");
        const body = opened ? t("pair.opened.body") : answer.data === "no" ? t("pair.declined.body") : t("pair.expired.body");
        return (
            <div className="flex flex-col items-center gap-4 py-8 text-center" data-testid={opened ? "pair-opened" : "pair-closed"}>
                <span className="grid h-16 w-16 place-items-center rounded-full bg-[#1E1E1E]">
                    {opened ? <Check className="h-8 w-8 text-[#EFFF00]" aria-hidden /> : <X className="h-8 w-8 text-[#EFFF00]" aria-hidden />}
                </span>
                <h1 dir={dir} className="text-[24px] font-bold leading-snug text-[#1E1E1E]">{title}</h1>
                <p dir={dir} className="max-w-xs text-[15px] leading-relaxed text-[#8A847A]">{body}</p>
                <button
                    type="button"
                    onClick={backToApp}
                    className="mt-2 h-12 w-full rounded-2xl bg-[#1E1E1E] text-[15px] font-semibold text-white hover:bg-black active:scale-[0.99] transition"
                >
                    {t("pair.back")}
                </button>
            </div>
        );
    }

    if (detail.isError || !detail.data) {
        return (
            <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
                <p dir={dir} className="text-[15px] text-[#1E1E1E]">{t("pair.failed")}</p>
                <button type="button" onClick={() => void detail.refetch()} className="h-11 rounded-2xl bg-[#1E1E1E] px-6 text-[14px] font-semibold text-white">
                    {t("computerSetup.scanner.retry")}
                </button>
            </div>
        );
    }

    const d = detail.data;
    const device = d.browser && d.os ? t("pair.device", { browser: d.browser, os: d.os }) : d.os || d.browser || t("pair.deviceUnknown");
    const minutes = Math.floor((now - Date.parse(d.created_at)) / 60_000);
    const when = minutes < 1 ? t("pair.justNow") : t("pair.minutesAgo", { count: minutes });
    const abroad = d.country !== null && d.country !== "IQ";
    const busy = answer.isPending;

    return (
        <div className="flex flex-col gap-5" data-testid="pair-ask">
            <h1 dir={dir} className="text-left font-[family-name:var(--font-fermi-display),var(--font-geist-sans)] text-[30px] font-bold leading-[1.2] tracking-tight text-[#1E1E1E]">
                {t("pair.title")}
            </h1>

            <div className="flex items-center gap-3 rounded-2xl border border-[#E2DCCF] bg-white px-4 py-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1E1E1E]">
                    <Laptop className="h-5 w-5 text-[#EFFF00]" aria-hidden />
                </span>
                <div dir={dir} className="min-w-0 flex-1 text-left">
                    <p className="text-[15px] font-semibold text-[#1E1E1E]" data-testid="pair-device">{device}</p>
                    <p className="text-[13px] text-[#8A847A]">{when}</p>
                </div>
            </div>

            <p dir={dir} className="text-left text-[15px] leading-relaxed text-[#5F5A52]">
                {shopName ? t("pair.body", { shop: shopName }) : t("pair.bodyNoShop")}
            </p>

            <div dir={dir} className="flex items-start gap-2.5 rounded-2xl bg-[#FFF6D6] px-4 py-3 text-left text-[13.5px] leading-relaxed text-[#5A4A10]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="grid gap-1">
                    {abroad && d.country && <p className="font-semibold" data-testid="pair-abroad">{t("pair.abroad", { country: regionName(d.country, language) })}</p>}
                    <p>{t("pair.warn")}</p>
                </div>
            </div>

            {answer.isError && (
                <p role="alert" dir={dir} className="text-left text-[14px] text-[#E5243B]">{t("pair.failed")}</p>
            )}

            <div className="grid gap-2.5">
                <button
                    type="button"
                    onClick={() => answer.mutate("yes")}
                    disabled={busy}
                    data-testid="pair-yes"
                    className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-[#1E1E1E] text-[15.5px] font-semibold text-white hover:bg-black active:scale-[0.99] disabled:opacity-60 transition"
                >
                    {busy && answer.variables === "yes" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Check className="h-5 w-5 text-[#EFFF00]" aria-hidden />}
                    {t("pair.yes")}
                </button>
                <button
                    type="button"
                    onClick={() => answer.mutate("no")}
                    disabled={busy}
                    data-testid="pair-no"
                    className="h-12 rounded-2xl border border-[#E2DCCF] bg-white text-[15px] font-semibold text-[#1E1E1E] hover:bg-[#FAF8F3] disabled:opacity-60 transition"
                >
                    {t("pair.no")}
                </button>
            </div>
        </div>
    );
}
