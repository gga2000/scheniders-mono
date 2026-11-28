"use client";

// =====================================================================
// ComputerSignInCard: «عندك فيرمي بموبايلك؟» on the computer's sign-in page
// =====================================================================
// Shows a QR code, like WhatsApp Web. The phone, already signed in, scans it
// (with its own camera, or the button on the phone's setup screen) and
// presses yes; this page then receives that person's session and opens the
// shop (lib/computer-sign-in.ts). The page keeps the secret; the code carries
// only the request id. A code lasts a few minutes and is replaced while the
// page stays open, up to a handful of times, then waits for a press.
// =====================================================================

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw, Smartphone } from "lucide-react";
import { z } from "zod";
import { safeRedirectPath } from "@scheniders/shared/safe-redirect-path";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { SIGN_IN_CODE_LIFE_MS, computerSignInPath } from "@/lib/computer-sign-in";
import { cn } from "@/lib/utils";

/** How often the page asks whether its code was scanned. */
const ASK_EVERY_MS = 2000;
/**
 * A fresh code a few seconds before the old one runs out: after the phone's
 * last moment to answer it (SIGN_IN_ANSWER_MARGIN_MS), so no yes is missed.
 */
const NEW_CODE_EVERY_MS = SIGN_IN_CODE_LIFE_MS - 5_000;
/** Codes made before the page waits for a press (about 15 minutes). */
const MAX_CODES = 5;

const CODE_KEY = ["computer-sign-in-code"] as const;

const codeSchema = z.object({
    success: z.literal(true),
    data: z.object({ id: z.uuid(), secret: z.string(), expires_at: z.string() }),
});
const waitSchema = z.object({
    success: z.literal(true),
    data: z.object({ state: z.enum(["waiting", "approved", "declined", "expired", "used", "failed", "signed_in"]) }),
});
type WaitState = z.infer<typeof waitSchema>["data"]["state"];

interface Code {
    id: string;
    secret: string;
    image: string;
}

/** A new request, drawn as a QR code of the phone's yes page for it. */
async function requestCode(): Promise<Code> {
    const res = await fetch("/api/auth/computer-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ touch: navigator.maxTouchPoints > 1 }),
    });
    if (!res.ok) throw new Error(`computer sign-in code: HTTP ${res.status}`);
    const body = codeSchema.parse(await res.json());
    const { default: QRCode } = await import("qrcode");
    const image = await QRCode.toDataURL(`${window.location.origin}${computerSignInPath(body.data.id)}`, {
        margin: 0,
        width: 320,
        errorCorrectionLevel: "M",
        color: { dark: "#1E1E1E", light: "#FFFFFF" },
    });
    return { id: body.data.id, secret: body.data.secret, image };
}

/** Whether the code was scanned; on "signed_in" this response carried the session cookies. */
async function askWait(code: Code): Promise<WaitState> {
    const res = await fetch("/api/auth/computer-sign-in/wait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: code.id, secret: code.secret }),
    });
    // Unknown to the server (a day old, or never made): this code is over.
    if (res.status === 404) return "expired";
    if (!res.ok) throw new Error(`computer sign-in wait: HTTP ${res.status}`);
    return waitSchema.parse(await res.json()).data.state;
}

function readReturnTo(): string {
    return safeRedirectPath(new URLSearchParams(window.location.search).get("returnTo"));
}

export function ComputerSignInCard({ tone }: { tone: "dark" | "light" }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const queryClient = useQueryClient();

    // The code is replaced on its own while the page stays open, up to
    // MAX_CODES times; after that it waits for a press.
    const codeQ = useQuery({
        queryKey: CODE_KEY,
        queryFn: requestCode,
        staleTime: Infinity,
        gcTime: 0,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchInterval: (query) => (query.state.dataUpdateCount < MAX_CODES ? NEW_CODE_EVERY_MS : false),
    });
    const code = codeQ.data ?? null;

    // Asked every 2 seconds while the tab is shown; stops once there is an answer.
    const waitQ = useQuery({
        queryKey: ["computer-sign-in-wait", code?.id ?? ""],
        queryFn: () => (code ? askWait(code) : Promise.resolve<WaitState>("waiting")),
        enabled: code !== null,
        gcTime: 0,
        retry: 3,
        refetchInterval: (query) => (query.state.data === undefined || query.state.data === "waiting" || query.state.data === "approved" ? ASK_EVERY_MS : false),
    });
    const state = waitQ.data ?? "waiting";

    useEffect(() => {
        // A full load, so the whole app starts with the new session's cookies.
        if (state === "signed_in") window.location.assign(readReturnTo());
    }, [state]);

    const startOver = () => void queryClient.resetQueries({ queryKey: CODE_KEY });

    const showing =
        codeQ.isError ? "error"
        : !code ? "loading"
        : state === "signed_in" ? "opening"
        : state === "declined" ? "declined"
        : state === "failed" ? "failed"
        : state === "expired" || state === "used" ? "paused"
        : "code";

    const dark = tone === "dark";
    const message =
        showing === "declined" ? t("computerSignIn.declined")
        : showing === "failed" ? t("computerSignIn.failed")
        : showing === "error" ? t("computerSignIn.error")
        : showing === "paused" ? t("computerSignIn.paused")
        : showing === "opening" ? t("computerSignIn.opening")
        : t("computerSignIn.body");

    return (
        <section
            aria-labelledby="computer-sign-in-title"
            data-testid="computer-sign-in"
            className={cn(
                "flex items-center gap-4 rounded-2xl p-3.5",
                dark ? "max-w-md border border-white/12 bg-white/[0.06] backdrop-blur-sm" : "border border-[#E2DCCF] bg-white",
            )}
        >
            <div className="relative grid h-[124px] w-[124px] shrink-0 place-items-center rounded-xl bg-white p-2.5">
                {showing === "code" && code ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URL made on this page; next/image adds nothing here
                    <img src={code.image} alt={t("computerSignIn.qrLabel")} width={104} height={104} className="h-[104px] w-[104px]" data-testid="computer-sign-in-qr" />
                ) : showing === "loading" || showing === "opening" ? (
                    <Loader2 className="h-6 w-6 animate-spin text-[#1E1E1E]" aria-label={t(showing === "opening" ? "computerSignIn.opening" : "computerSignIn.loading")} />
                ) : (
                    <button
                        type="button"
                        onClick={startOver}
                        data-testid="computer-sign-in-refresh"
                        className="grid h-full w-full place-items-center content-center gap-1.5 rounded-lg text-[12px] font-semibold text-[#1E1E1E] hover:bg-[#F5F0E8]"
                    >
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1E1E1E] text-[#EFFF00]">
                            <RotateCw className="h-[18px] w-[18px]" aria-hidden />
                        </span>
                        {t("computerSignIn.refresh")}
                    </button>
                )}
            </div>
            <div dir={dir} className="min-w-0 flex-1 text-left">
                <p id="computer-sign-in-title" className={cn("flex items-center gap-1.5 text-[15px] font-semibold", dark ? "text-white" : "text-[#1E1E1E]")}>
                    <Smartphone className={cn("h-4 w-4 shrink-0", dark ? "text-[#EFFF00]" : "text-[#1E1E1E]")} aria-hidden />
                    {t("computerSignIn.title")}
                </p>
                <p role="status" className={cn("mt-1.5 text-[13px] leading-relaxed", dark ? "text-[#C9C4B8]" : "text-[#8A847A]")}>
                    {message}
                </p>
            </div>
        </section>
    );
}
