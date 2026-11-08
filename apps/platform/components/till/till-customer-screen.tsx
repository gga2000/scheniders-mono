"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import { useTenantBrand } from "@/hooks/chat/use-tenant-brand";
import { useLanguage } from "@/hooks/use-language";
import { formatIqd } from "@/lib/till/cart";
import { cn } from "@/lib/utils";
import { CUSTOMER_CHANNEL, HELLO, readDisplayMessage, type DisplayState } from "@/lib/till/customer-display";
import { useShowChangedLine } from "./use-show-changed-line";

/**
 * The screen that faces the customer. It only listens to the till window on this
 * device; it never writes anything. Drag the window to the customer's screen and
 * make it full screen.
 */
export function TillCustomerScreen() {
    const { t } = useLanguage();
    const brand = useTenantBrand();
    const [state, setState] = useState<DisplayState | null>(null);
    const [noChannel, setNoChannel] = useState(false);
    const [badLogo, setBadLogo] = useState<string | null>(null);
    const [readyLogo, setReadyLogo] = useState<string | null>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const saleLines = state && state.view !== "idle" ? state.lines : null;
    const shownLines = useMemo(() => (saleLines ?? []).map((l) => ({ id: `${l.name}|${l.variant ?? ""}|${l.price}`, quantity: l.quantity })), [saleLines]);
    useShowChangedLine(listRef, shownLines, "customer");

    useEffect(() => {
        if (typeof BroadcastChannel === "undefined") {
            setNoChannel(true);
            return;
        }
        const ch = new BroadcastChannel(CUSTOMER_CHANNEL);
        ch.onmessage = (e: MessageEvent) => {
            const next = readDisplayMessage(e.data);
            if (next) setState(next);
        };
        ch.postMessage(HELLO);
        return () => ch.close();
    }, []);

    const shopName = state?.shopName ?? "";
    const storeName = brand.name ?? "";

    // A logo link that fails falls back to the store name, never an empty white box in front of the customer.
    const logoUrl = brand.logoUrl && brand.logoUrl !== badLogo ? brand.logoUrl : null;
    // Hidden until it has loaded, so the customer never sees an empty white box while it downloads.
    const logoShown = logoUrl !== null && readyLogo === logoUrl ? "" : "invisible";
    // An image already in the cache can finish before React listens for onLoad.
    const logoRef = (el: HTMLImageElement | null) => {
        if (el && logoUrl && el.complete && el.naturalWidth > 0) setReadyLogo(logoUrl);
    };
    const brandMark = logoUrl ? (
        <img ref={logoRef} src={logoUrl} alt="" onLoad={() => setReadyLogo(logoUrl)} onError={() => setBadLogo(logoUrl)} className={cn("h-12 w-12 rounded-xl bg-white object-contain p-1", logoShown)} />
    ) : null;

    if (noChannel || !state || state.view === "idle") {
        return (
            <div className="till-screen flex h-screen flex-col bg-[#1E1E1E] text-white" onDoubleClick={() => void document.documentElement.requestFullscreen?.()}>
                <Center>
                    {noChannel ? (
                        <p className="text-xl" dir="auto">{t("till.customer.unsupported")}</p>
                    ) : (
                        <>
                            {logoUrl ? (
                                <img ref={logoRef} src={logoUrl} alt={storeName} onLoad={() => setReadyLogo(logoUrl)} onError={() => setBadLogo(logoUrl)} className={cn("max-h-44 max-w-[50vw] rounded-[32px] bg-white object-contain p-4", logoShown)} />
                            ) : (
                                <p className="text-6xl font-bold tracking-tight" dir="auto">{storeName}</p>
                            )}
                            <p className="mt-10 text-5xl font-bold" dir="auto">{t("till.customer.welcome")}</p>
                            {shopName && <p className="mt-3 text-2xl text-white/60" dir="auto">{shopName}</p>}
                            {!state && <p className="mt-16 max-w-md text-center text-sm text-white/50" dir="auto">{t("till.customer.howTo")}</p>}
                        </>
                    )}
                </Center>
            </div>
        );
    }

    const qrPay = state.view === "pay" && state.qr && (state.method === "fib" || state.method === "zaincash") ? state.qr : null;

    // One layout at every step: the sale on the left, the dark panel on the right. Only the panel changes.
    return (
        <div className="till-screen grid h-screen grid-cols-[1fr_minmax(360px,38%)] bg-[#F6F1E9] text-[#1E1E1E] dark:bg-[#121212] dark:text-white" onDoubleClick={() => void document.documentElement.requestFullscreen?.()}>
            <ul ref={listRef} className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto p-10 transition-opacity", state.view === "done" && "opacity-50")}>
                {state.lines.map((l, i) => (
                    <li key={i} className="flex items-center gap-5 rounded-[24px] bg-white p-4 dark:bg-white/5">
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F6F1E9] dark:bg-white/10">
                            {l.image ? <img src={l.image} alt="" className="h-full w-full object-cover" /> : <Package className="h-7 w-7 opacity-40" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1" dir="auto">
                            <span className="block truncate text-2xl font-semibold">{l.name}</span>
                            <span className="block text-lg tabular-nums text-[#1E1E1E]/75 dark:text-white/75">
                                {l.variant ? `${l.variant} · ` : ""}
                                <bdi dir="ltr">
                                    {l.quantity} × {formatIqd(l.price)}
                                </bdi>
                            </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                            {l.listPrice > l.price && <span className="text-lg tabular-nums text-[#1E1E1E]/65 line-through dark:text-white/65">{formatIqd(l.listPrice * l.quantity)}</span>}
                            <span className="text-2xl font-bold tabular-nums">{formatIqd(l.price * l.quantity)}</span>
                        </span>
                    </li>
                ))}
                {state.discount > 0 && (
                    <li className="flex items-center justify-between rounded-[24px] border-2 border-dashed border-[#14532D]/50 px-6 py-4 text-[#14532D] dark:border-emerald-300/50 dark:text-emerald-200">
                        <span className="text-2xl font-semibold" dir="auto">{t("till.customer.discount")}</span>
                        <span className="text-2xl font-bold tabular-nums">−{formatIqd(state.discount)}</span>
                    </li>
                )}
            </ul>

            <aside className="flex min-h-0 flex-col gap-4 bg-[#1E1E1E] p-10 text-white">
                <div className="flex items-center gap-3">
                    {brandMark}
                    <span className="min-w-0">
                        <span className="block truncate text-xl font-semibold" dir="auto">{storeName}</span>
                        {shopName && <span className="block truncate text-base text-white/60" dir="auto">{shopName}</span>}
                    </span>
                </div>

                {state.view === "cart" ? (
                    <div className="mt-auto flex flex-col gap-3">
                        {state.saved > 0 && <Saved text={t("till.customer.saved", { amount: formatIqd(state.saved) })} />}
                        <p className="text-xl text-white/60" dir="auto">{t("till.customer.total")}</p>
                        <p className={cn("font-bold tabular-nums tracking-tight", bigSize(formatIqd(state.total)))}>
                            {formatIqd(state.total)} <span className="text-2xl font-semibold text-white/60">{t("till.iqd")}</span>
                        </p>
                    </div>
                ) : state.view === "pay" && qrPay ? (
                    <div className="my-auto flex flex-col items-center gap-4 text-center">
                        <p className="text-2xl font-semibold" dir="auto">{t("till.customer.scan", { method: t(`till.pay.method.${state.method}`) })}</p>
                        <img src={qrPay} alt={t("till.pay.qrAlt", { method: t(`till.pay.method.${state.method}`) })} className="aspect-square w-[min(100%,22rem)] rounded-[28px] bg-white object-contain p-5" />
                        <p className={cn("font-bold tabular-nums tracking-tight", formatIqd(state.due).length > 7 ? "text-6xl" : "text-7xl")}>
                            {formatIqd(state.due)} <span className="text-2xl font-semibold text-white/60">{t("till.iqd")}</span>
                        </p>
                        {state.saved > 0 && <Saved text={t("till.customer.saved", { amount: formatIqd(state.saved) })} />}
                        {(storeName || shopName) && (
                            <p className="text-xl text-white/60" dir="auto">{t("till.customer.payTo", { name: [storeName, shopName].filter(Boolean).join(" · ") })}</p>
                        )}
                    </div>
                ) : state.view === "pay" ? (
                    <div className="mt-auto flex flex-col gap-4">
                        {state.saved > 0 && <Saved text={t("till.customer.saved", { amount: formatIqd(state.saved) })} />}
                        <Row
                            label={state.method === "cash" ? t("till.customer.toPayCash") : t("till.customer.toPay", { method: t(`till.pay.method.${state.method}`) })}
                            value={formatIqd(state.due)}
                            big={!(state.method === "cash" && state.given > 0)}
                            unit={t("till.iqd")}
                        />
                        {state.method === "cash" && state.given > 0 && (
                            <>
                                <Row label={t("till.customer.gave")} value={formatIqd(state.given)} unit={t("till.iqd")} />
                                <Change label={t("till.customer.change")} value={formatIqd(state.change)} unit={t("till.iqd")} />
                            </>
                        )}
                    </div>
                ) : (
                    <div className="my-auto flex flex-col items-center gap-6 text-center">
                        <p className="text-6xl font-bold" dir="auto">{t("till.customer.thanks")}</p>
                        {state.change > 0 && <Change label={t("till.customer.change")} value={formatIqd(state.change)} unit={t("till.iqd")} />}
                        {state.saved > 0 && <Saved text={t("till.customer.saved", { amount: formatIqd(state.saved) })} />}
                    </div>
                )}
            </aside>
        </div>
    );
}

/** The panel is about 38% of the screen: longer amounts step down so the number and its unit never clip. */
function bigSize(value: string) {
    return value.length > 7 ? "text-6xl" : value.length > 5 ? "text-7xl" : "text-8xl";
}

function Center({ children }: { children: React.ReactNode }) {
    return <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">{children}</div>;
}

function Row({ label, value, unit, big = false }: { label: string; value: string; unit: string; big?: boolean }) {
    return big ? (
        <div className="flex flex-col gap-2">
            <p className="text-xl text-white/60" dir="auto">{label}</p>
            <p className={cn("font-bold tabular-nums tracking-tight", bigSize(value))}>
                {value} <span className="text-2xl font-semibold text-white/60">{unit}</span>
            </p>
        </div>
    ) : (
        <p className="flex items-baseline justify-between gap-4 text-2xl text-white/70">
            <span dir="auto">{label}</span>
            <span className="text-4xl font-bold tabular-nums text-white">
                {value} <span className="text-lg font-semibold text-white/60">{unit}</span>
            </span>
        </p>
    );
}

function Change({ label, value, unit }: { label: string; value: string; unit: string }) {
    return (
        <div className="w-full rounded-[28px] bg-[#E3F6DA] px-8 py-6 text-[#14532D]">
            <p className="text-xl font-semibold" dir="auto">{label}</p>
            <p className={cn("font-bold tabular-nums tracking-tight", value.length > 7 ? "text-6xl" : "text-7xl")}>
                {value} <span className="text-2xl font-semibold">{unit}</span>
            </p>
        </div>
    );
}

function Saved({ text }: { text: string }) {
    return (
        <p className="w-fit rounded-full bg-[#E3F6DA] px-5 py-2 text-xl font-bold text-[#14532D]" dir="auto">
            {text}
        </p>
    );
}
