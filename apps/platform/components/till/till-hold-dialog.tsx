"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useTillHoldAdd } from "@/hooks/use-till";
import { dateLocale, itemCount, type CartLine } from "@/lib/till/cart";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

const HOURS = [2, 24, 72, 168] as const;

/** Keeps the cart's bottles aside for a named customer, out of sellable stock until they come back. */
export function TillHoldDialog({
    sessionId,
    lines,
    customerName,
    phone,
    onKept,
    onClose,
}: {
    sessionId: string;
    lines: CartLine[];
    customerName: string;
    phone: string;
    /** The cart lines that were kept aside, by key; they leave the cart. */
    onKept: (keys: string[]) => void;
    onClose: () => void;
}) {
    const { t, language } = useLanguage();
    const hold = useTillHoldAdd();
    // One id per line for this open dialog, so a double tap or a retry keeps each bottle once.
    const [clientIds] = useState(() => new Map(lines.map((l) => [l.key, crypto.randomUUID()])));
    const [name, setName] = useState(customerName);
    const [phoneText, setPhoneText] = useState(phone);
    const [hours, setHours] = useState<(typeof HOURS)[number]>(24);
    // The clock is read once, when the dialog opens.
    const [openedAt] = useState(() => Date.now());
    const normalPhone = phoneText.trim() ? normalizeIraqiMobile(phoneText) : null;
    const phoneBad = phoneText.trim() !== "" && !normalPhone;
    const ready = name.trim().length > 0 && !phoneBad && !hold.isPending;
    const pieces = itemCount(lines);
    const until = new Date(openedAt + hours * 3_600_000).toLocaleString(dateLocale(language), {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Baghdad",
    });

    const submit = () =>
        hold.mutate(
            {
                sessionId,
                name: name.trim(),
                phone: normalPhone,
                hours,
                lines: lines.map((l) => ({
                    key: l.key,
                    clientId: clientIds.get(l.key) ?? crypto.randomUUID(),
                    productId: l.product_id,
                    variantId: l.variant_id,
                    quantity: l.quantity,
                    name: l.variant_name ? `${l.name} ${l.variant_name}` : l.name,
                })),
            },
            {
                onSuccess: (r) => {
                    if (r.kept.length > 0) onKept(r.kept);
                    if (r.short.length > 0) {
                        // The kept lines left the cart; the short ones stay so the cashier can sell or change them.
                        toast({ title: t("till.hold.short", { names: r.short.map((x) => x.name).join("، ") }), variant: "warning" });
                        return;
                    }
                    toast({ title: t("till.hold.saved", { name: name.trim(), until }), variant: "success" });
                    onClose();
                },
                onError: () => toast({ title: t("till.hold.failed"), variant: "error" }),
            },
        );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="till-screen md:max-w-lg">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-left">
                            <Bookmark className="h-5 w-5" aria-hidden="true" />
                            {t("till.hold.title")}
                        </DialogTitle>
                        <DialogDescription className="text-left" dir="auto">
                            {t("till.hold.subtitle", { n: pieces })}
                        </DialogDescription>
                    </DialogHeader>

                    <ul className="flex flex-col gap-2">
                        {lines.map((l) => (
                            <li key={l.key} className="flex items-center gap-3">
                                <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
                                    {l.image_url && <img src={l.image_url} alt="" className="h-full w-full object-cover" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                    {l.name}
                                    {l.variant_name && <span className="ms-1 font-medium text-muted">{l.variant_name}</span>}
                                </span>
                                <span className="text-sm font-bold tabular-nums text-foreground">×{l.quantity}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="grid grid-cols-2 gap-2">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, 100))}
                            placeholder={t("till.hold.name")}
                            aria-label={t("till.hold.name")}
                            autoFocus={!customerName.trim()}
                            className="h-12 rounded-2xl border border-stone-400 dark:border-white/25 bg-transparent px-4 text-sm text-foreground outline-none focus:border-[var(--ink)]"
                            dir="auto"
                        />
                        <input
                            value={phoneText}
                            onChange={(e) => setPhoneText(e.target.value)}
                            placeholder={t("till.hold.phone")}
                            aria-label={t("till.hold.phone")}
                            inputMode="tel"
                            className={cn(
                                "h-12 rounded-2xl border bg-transparent px-4 text-sm tabular-nums text-foreground outline-none focus:border-[var(--ink)]",
                                phoneBad ? "border-red-500" : "border-stone-400 dark:border-white/25",
                            )}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.hold.for")}</p>
                        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("till.hold.for")}>
                            {HOURS.map((h) => (
                                <button
                                    key={h}
                                    type="button"
                                    role="radio"
                                    aria-checked={hours === h}
                                    onClick={() => setHours(h)}
                                    className={cn(
                                        "h-12 rounded-2xl border text-sm font-semibold",
                                        hours === h ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                                    )}
                                >
                                    {t(`till.hold.hours.${h}`)}
                                </button>
                            ))}
                        </div>
                        <p className="text-left text-xs text-muted" dir="auto">{t("till.hold.until", { until })}</p>
                    </div>

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!ready}
                        className={cn("h-14 w-full rounded-2xl text-base font-bold", INK_BUTTON, "disabled:bg-[var(--card-border)] disabled:text-muted dark:disabled:bg-white/10 dark:disabled:text-white/40")}
                    >
                        {hold.isPending
                            ? t("till.hold.saving")
                            : name.trim()
                              ? t("till.hold.keep", { n: pieces, name: name.trim() })
                              : t("till.hold.needName")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
