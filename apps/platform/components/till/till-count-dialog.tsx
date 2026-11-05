"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Minus, Package, Plus, ScanLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useTillCountApply, type TillOverview } from "@/hooks/use-till";
import { findByCode, lineKey, MAX_QTY, type TillProduct } from "@/lib/till/cart";
import { countLines, isBigDrop, summarizeCount, type CountLine } from "@/lib/till/count";
import { beep } from "@/lib/till/feedback";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

type Notice = { kind: "ok" | "bad"; text: string };

/**
 * A shelf count at the Till: scan every bottle (or tap + and −), see what is
 * missing or extra, then set stock to the count in one go. Managers only.
 */
export function TillCountDialog({
    sessionId,
    products,
    chips,
    sound,
    onClose,
}: {
    sessionId: string;
    /** Everything the till sells, with stock as it is now. */
    products: TillProduct[];
    chips: TillOverview["chips"];
    sound: boolean;
    onClose: () => void;
}) {
    const { t } = useLanguage();
    const apply = useTillCountApply();
    const [scope, setScope] = useState<string>("all");
    const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
    const [query, setQuery] = useState("");
    const [lastKey, setLastKey] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [uncountedIsZero, setUncountedIsZero] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Big drops need a second tap, so a half-done count cannot wipe stock by accident.
    const [sure, setSure] = useState(false);

    const allLines = useMemo(() => countLines(products), [products]);
    const scoped = useMemo(() => {
        const chip = chips.find((c) => c.id === scope);
        if (!chip) return allLines;
        const ids = new Set(chip.product_ids);
        // A bottle scanned from outside the chip still counts.
        return allLines.filter((l) => ids.has(l.product_id) || counts.has(l.key));
    }, [allLines, chips, scope, counts]);
    const summary = summarizeCount(scoped, counts, uncountedIsZero);

    const q = query.trim().toLowerCase();
    const shown = q ? scoped.filter((l) => `${l.name} ${l.variant_name ?? ""}`.toLowerCase().includes(q)) : scoped;

    const bump = (line: CountLine, by: number) => {
        setCounts((prev) => {
            const next = new Map(prev);
            next.set(line.key, Math.min(MAX_QTY, Math.max(0, (prev.get(line.key) ?? 0) + by)));
            return next;
        });
        setLastKey(line.key);
        setReviewing(false);
    };

    // A barcode scanner types the code and presses Enter.
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = query.trim();
        if (!code) return;
        const hit = findByCode(products, code);
        const key = hit && (hit.variant ? lineKey(hit.product.id, hit.variant.id) : hit.product.variants.length === 0 ? lineKey(hit.product.id, null) : null);
        const line = key ? allLines.find((l) => l.key === key) : undefined;
        if (line) {
            setQuery("");
            bump(line, 1);
            if (sound) beep("ok");
            setNotice({ kind: "ok", text: t("till.count.scanned", { name: line.variant_name ? `${line.name} ${line.variant_name}` : line.name, n: (counts.get(line.key) ?? 0) + 1 }) });
            return;
        }
        if (hit) {
            // The code is the product's, not a size's: leave its sizes on screen to tap.
            setQuery(hit.product.name);
            setNotice({ kind: "bad", text: t("till.count.pickSize", { name: hit.product.name }) });
            return;
        }
        if (shown.length === 1) {
            // One name matches what was typed: count it.
            const only = shown[0];
            setQuery("");
            bump(only, 1);
            setNotice({ kind: "ok", text: t("till.count.scanned", { name: only.variant_name ? `${only.name} ${only.variant_name}` : only.name, n: (counts.get(only.key) ?? 0) + 1 }) });
            return;
        }
        if (shown.length === 0) {
            if (sound) beep("bad");
            setNotice({ kind: "bad", text: t("till.sell.unknownCode", { code }) });
        }
    };

    const save = () =>
        apply.mutate(
            {
                sessionId,
                lines: summary.changes.map((c) => ({ product_id: c.line.product_id, variant_id: c.line.variant_id, counted: c.counted })),
            },
            {
                onSuccess: (changed) => {
                    toast({ title: t("till.count.saved", { n: changed, count: changed }), variant: "success" });
                    onClose();
                },
                onError: () => toast({ title: t("till.count.failed"), variant: "error" }),
            },
        );

    const bigLoss = summary.changes.filter(isBigDrop).reduce((sum, c) => sum - c.diff, 0);

    const close = () => (counts.size > 0 && !apply.isSuccess ? setLeaving(true) : onClose());

    return (
        <Dialog open onOpenChange={(o) => !o && close()}>
            <DialogContent className="till-screen md:max-w-3xl">
                <div className="flex max-h-[80vh] flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-left">
                            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                            {t("till.count.title")}
                        </DialogTitle>
                        <DialogDescription className="text-left" dir="auto">
                            {t("till.count.subtitle")}
                        </DialogDescription>
                    </DialogHeader>

                    {leaving && (
                        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-[#92400E] dark:bg-amber-500/10 dark:text-amber-200">
                            <span className="min-w-0 flex-1 text-left font-semibold" dir="auto">{t("till.count.leaveAsk", { n: summary.scanned })}</span>
                            <button type="button" onClick={() => setLeaving(false)} className={cn("h-10 rounded-xl px-4 text-sm font-bold", INK_BUTTON)}>
                                {t("till.count.keepCounting")}
                            </button>
                            <button type="button" onClick={onClose} className="h-10 rounded-xl border border-current/30 px-4 text-sm font-semibold">
                                {t("till.count.leave")}
                            </button>
                        </div>
                    )}

                    {chips.length > 0 && (
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("till.count.scope")}>
                            {[{ id: "all", name: t("till.count.everything") }, ...chips].map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={scope === c.id}
                                    onClick={() => {
                                        setScope(c.id);
                                        setReviewing(false);
                                    }}
                                    className={cn(
                                        "h-10 rounded-full border px-4 text-sm font-semibold",
                                        scope === c.id ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                                    )}
                                    dir="auto"
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <form onSubmit={submit} className="flex flex-col gap-1.5">
                        <label className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--card-border)] px-4 focus-within:border-[var(--ink)]">
                            <ScanLine className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("till.count.scan")}
                                aria-label={t("till.count.scan")}
                                autoFocus
                                className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none"
                                dir="auto"
                            />
                        </label>
                        {notice && (
                            <p aria-live="polite" className={cn("text-left text-sm font-semibold", notice.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-[#92400E] dark:text-amber-300")} dir="auto">
                                {notice.text}
                            </p>
                        )}
                    </form>

                    {reviewing ? (
                        <ReviewList summary={summary} />
                    ) : (
                        <ul className="-mx-1 flex min-h-0 flex-1 flex-col divide-y divide-[var(--card-border)] overflow-y-auto px-1">
                            {shown.map((line) => (
                                <CountRow key={line.key} line={line} counted={counts.get(line.key)} fresh={line.key === lastKey} onBump={(by) => bump(line, by)} />
                            ))}
                            {shown.length === 0 && <li className="py-6 text-left text-sm text-muted" dir="auto">{t("till.count.noMatch")}</li>}
                        </ul>
                    )}

                    <footer className="flex flex-col gap-3 border-t border-[var(--card-border)] pt-4">
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums" dir="auto">
                            <span className="font-semibold text-foreground">{t("till.count.sumScanned", { n: summary.scanned })}</span>
                            <span className={summary.missing ? "font-semibold text-red-700 dark:text-red-300" : "text-muted"}>{t("till.count.sumMissing", { n: summary.missing })}</span>
                            <span className={summary.extra ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted"}>{t("till.count.sumExtra", { n: summary.extra })}</span>
                            <span className="text-muted">{t("till.count.sumNotCounted", { n: summary.notCounted })}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    checked={uncountedIsZero}
                                    onChange={(e) => {
                                        setUncountedIsZero(e.target.checked);
                                        setReviewing(false);
                                        setSure(false);
                                    }}
                                    className="h-5 w-5 accent-[var(--ink)]"
                                />
                                <span className="text-left" dir="auto">{t("till.count.uncountedZero")}</span>
                            </label>
                            {reviewing ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReviewing(false);
                                            setSure(false);
                                        }}
                                        className="h-12 rounded-2xl border border-[var(--card-border)] px-5 text-sm font-semibold text-foreground">
                                        {t("till.count.back")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => (bigLoss > 0 && !sure ? setSure(true) : save())}
                                        disabled={apply.isPending}
                                        className={cn(
                                            "h-12 rounded-2xl px-6 text-sm font-bold disabled:opacity-60",
                                            sure ? "bg-red-700 text-white hover:bg-red-800" : INK_BUTTON,
                                        )}
                                    >
                                        {apply.isPending
                                            ? t("till.count.saving")
                                            : sure
                                              ? t("till.count.fixSure", { n: bigLoss })
                                              : t("till.count.fix", { n: summary.changes.length })}
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setReviewing(true)}
                                    disabled={summary.changes.length === 0}
                                    className={cn("h-12 rounded-2xl px-6 text-sm font-bold", INK_BUTTON, "disabled:bg-[var(--card-border)] disabled:text-muted dark:disabled:bg-white/10 dark:disabled:text-white/40")}
                                >
                                    {summary.changes.length ? t("till.count.review", { n: summary.changes.length }) : t("till.count.allMatch")}
                                </button>
                            )}
                        </div>
                    </footer>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CountRow({ line, counted, fresh, onBump }: { line: CountLine; counted: number | undefined; fresh: boolean; onBump: (by: number) => void }) {
    const { t } = useLanguage();
    const diff = counted === undefined ? null : counted - line.expected;
    return (
        <li className={cn("flex items-center gap-3 py-2.5", fresh && "bg-[var(--card-border)]/20")}>
            <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
                {line.image_url ? (
                    <img src={line.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                        <Package className="h-4 w-4" aria-hidden="true" />
                    </span>
                )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-left text-sm font-semibold text-foreground" dir="auto">
                    {line.name}
                    {line.variant_name && <span className="ms-1 font-medium text-muted">{line.variant_name}</span>}
                </span>
                <span className="text-left text-xs text-muted" dir="auto">{t("till.count.expected", { n: line.expected })}</span>
            </span>
            {diff !== null && diff !== 0 && (
                <span
                    className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                        diff < 0 ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
                    )}
                >
                    {diff < 0 ? t("till.count.missing", { n: -diff }) : t("till.count.extra", { n: diff })}
                </span>
            )}
            {diff === 0 && <span className="rounded-full bg-[var(--card-border)]/40 px-2.5 py-1 text-xs font-bold text-foreground">{t("till.count.match")}</span>}
            <span className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={() => onBump(-1)}
                    disabled={!counted}
                    aria-label={t("till.count.less", { name: line.name })}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground disabled:opacity-40"
                >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className={cn("w-10 text-center text-lg font-bold tabular-nums", counted === undefined ? "text-muted" : "text-foreground")}>{counted ?? "·"}</span>
                <button
                    type="button"
                    onClick={() => onBump(1)}
                    aria-label={t("till.count.more", { name: line.name })}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
            </span>
        </li>
    );
}

function ReviewList({ summary }: { summary: ReturnType<typeof summarizeCount> }) {
    const { t } = useLanguage();
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="text-left text-sm text-muted" dir="auto">{t("till.count.reviewHint")}</p>
            <ul className="flex min-h-0 flex-1 flex-col divide-y divide-[var(--card-border)] overflow-y-auto">
                {summary.changes.map((c) => (
                    <li key={c.line.key} className="flex items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground" dir="auto">
                            {c.line.name}
                            {c.line.variant_name && <span className="ms-1 font-medium text-muted">{c.line.variant_name}</span>}
                        </span>
                        <span className="text-sm tabular-nums text-muted">
                            {c.line.expected} → <span className="font-bold text-foreground">{c.counted}</span>
                        </span>
                        {isBigDrop(c) && (
                            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300" dir="auto">
                                {t("till.count.bigDrop")}
                            </span>
                        )}
                        <span className={cn("w-14 text-right text-sm font-bold tabular-nums", c.diff < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
                            {c.diff > 0 ? `+${c.diff}` : c.diff}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
