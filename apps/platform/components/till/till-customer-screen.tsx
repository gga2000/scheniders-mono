"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { useTenantBrand } from "@/hooks/chat/use-tenant-brand";
import { useLanguage } from "@/hooks/use-language";
import { formatIqd } from "@/lib/till/cart";
import { CUSTOMER_CHANNEL, HELLO, readDisplayMessage, type DisplayState } from "@/lib/till/customer-display";

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

    return (
        <div className="till-screen flex h-screen flex-col bg-[#F6F1E9] text-[#1E1E1E] dark:bg-[#121212] dark:text-white" onDoubleClick={() => void document.documentElement.requestFullscreen?.()}>
            {noChannel ? (
                <Center>
                    <p className="text-xl" dir="auto">{t("till.customer.unsupported")}</p>
                </Center>
            ) : !state || state.view === "idle" ? (
                <Center>
                    {brand.logoUrl ? (
                        <img src={brand.logoUrl} alt={storeName} className="max-h-48 max-w-[60vw] object-contain" />
                    ) : (
                        <p className="text-6xl font-bold tracking-tight" dir="auto">{storeName}</p>
                    )}
                    <p className="mt-8 text-3xl font-semibold" dir="auto">{t("till.customer.welcome")}</p>
                    {shopName && <p className="mt-2 text-xl text-[#1E1E1E]/60 dark:text-white/60" dir="auto">{shopName}</p>}
                    {!state && <p className="mt-16 max-w-md text-center text-sm text-[#1E1E1E]/50 dark:text-white/50" dir="auto">{t("till.customer.howTo")}</p>}
                </Center>
            ) : state.view === "cart" ? (
                <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(320px,38%)]">
                    <ul className="flex min-h-0 flex-col gap-3 overflow-y-auto p-10">
                        {state.lines.map((l, i) => (
                            <li key={i} className="flex items-center gap-5 rounded-[24px] bg-white p-4 dark:bg-white/5">
                                <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F6F1E9] dark:bg-white/10">
                                    {l.image ? <img src={l.image} alt="" className="h-full w-full object-cover" /> : <Package className="h-7 w-7 opacity-40" aria-hidden="true" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-2xl font-semibold" dir="auto">{l.name}</span>
                                    <span className="block text-lg tabular-nums text-[#1E1E1E]/60 dark:text-white/60" dir="auto">
                                        {l.variant ? `${l.variant} · ` : ""}
                                        {l.quantity} × {formatIqd(l.price)}
                                    </span>
                                </span>
                                <span className="shrink-0 text-2xl font-bold tabular-nums">{formatIqd(l.price * l.quantity)}</span>
                            </li>
                        ))}
                    </ul>
                    <aside className="flex flex-col justify-end gap-4 bg-[#1E1E1E] p-10 text-white">
                        {state.discount > 0 && (
                            <>
                                <Row label={t("till.customer.subtotal")} value={formatIqd(state.subtotal)} />
                                <Row label={t("till.customer.discount")} value={`−${formatIqd(state.discount)}`} />
                            </>
                        )}
                        <p className="text-xl text-white/60" dir="auto">{t("till.customer.total")}</p>
                        <p className="text-8xl font-bold tabular-nums tracking-tight">{formatIqd(state.total)}</p>
                        <p className="text-lg text-white/60" dir="auto">{t("till.customer.iqd")}</p>
                    </aside>
                </div>
            ) : state.view === "pay" ? (
                <Center>
                    {state.qr && (state.method === "fib" || state.method === "zaincash") ? (
                        <div className="flex items-center gap-14">
                            <img src={state.qr} alt={t("till.pay.qrAlt", { method: t(`till.pay.method.${state.method}`) })} className="h-[56vh] max-h-[520px] w-auto rounded-[32px] bg-white object-contain p-6" />
                            <div className="flex flex-col gap-3">
                                <p className="text-3xl font-semibold" dir="auto">{t("till.customer.scan", { method: t(`till.pay.method.${state.method}`) })}</p>
                                <p className="text-8xl font-bold tabular-nums tracking-tight">{formatIqd(state.due)}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <p className="text-2xl text-[#1E1E1E]/60 dark:text-white/60" dir="auto">
                                {state.method === "cash" ? t("till.customer.toPayCash") : t("till.customer.toPay", { method: t(`till.pay.method.${state.method}`) })}
                            </p>
                            <p className="text-[9rem] font-bold leading-none tabular-nums tracking-tight">{formatIqd(state.due)}</p>
                            {state.method === "cash" && state.given > 0 && (
                                <div className="mt-10 flex gap-6">
                                    <Tile label={t("till.customer.gave")} value={formatIqd(state.given)} />
                                    <Tile label={t("till.customer.change")} value={formatIqd(state.change)} strong />
                                </div>
                            )}
                        </div>
                    )}
                </Center>
            ) : (
                <Center>
                    <p className="text-6xl font-bold" dir="auto">{t("till.customer.thanks")}</p>
                    {state.change > 0 && (
                        <div className="mt-10">
                            <Tile label={t("till.customer.change")} value={formatIqd(state.change)} strong />
                        </div>
                    )}
                    {brand.logoUrl && <img src={brand.logoUrl} alt={storeName} className="mt-14 max-h-20 object-contain opacity-80" />}
                </Center>
            )}
        </div>
    );
}

function Center({ children }: { children: React.ReactNode }) {
    return <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <p className="flex items-baseline justify-between text-2xl text-white/70">
            <span dir="auto">{label}</span>
            <span className="tabular-nums">{value}</span>
        </p>
    );
}

function Tile({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={strong ? "rounded-[28px] bg-[#E3F6DA] px-10 py-6 text-[#14532D]" : "rounded-[28px] bg-white px-10 py-6 dark:bg-white/5"}>
            <p className="text-xl" dir="auto">{label}</p>
            <p className="text-6xl font-bold tabular-nums">{value}</p>
        </div>
    );
}
