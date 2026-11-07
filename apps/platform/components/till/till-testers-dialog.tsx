"use client";

import { useState } from "react";
import { FlaskConical, Package, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import type { TillMember } from "@/hooks/use-shops";
import { useTillTesterEnd, useTillTesterOpen, useTillTesters } from "@/hooks/use-till";
import { dateLocale, searchProducts, type TillProduct, type TillVariant } from "@/lib/till/cart";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";
import { TillManagerDialog } from "./till-manager-dialog";

type Pick = { product: TillProduct; variant: TillVariant | null; label: string; available: number };
const MAX_MATCHES = 8;

/** Open bottles kept on the shelf for smelling: they leave stock but stay listed, so they never look missing. */
export function TillTestersDialog({
    sessionId,
    products,
    isManager,
    managers,
    onClose,
}: {
    sessionId: string;
    products: TillProduct[];
    /** Managers open testers straight away; anyone else needs a manager's PIN. */
    isManager: boolean;
    managers: TillMember[];
    onClose: () => void;
}) {
    const { t, language } = useLanguage();
    const testers = useTillTesters(sessionId);
    const open = useTillTesterOpen();
    const end = useTillTesterEnd();
    const [query, setQuery] = useState("");
    // Waiting on a manager's PIN for this bottle; the client id makes the retry land once.
    const [asking, setAsking] = useState<{ pick: Pick; clientId: string } | null>(null);

    const picks: Pick[] = query.trim()
        ? searchProducts(products, query)
              .flatMap((p): Pick[] =>
                  p.variants.length > 1
                      ? p.variants.map((v) => ({ product: p, variant: v, label: `${p.name} ${v.name}`, available: v.available }))
                      : [{ product: p, variant: p.variants[0] ?? null, label: p.name, available: p.variants[0]?.available ?? p.available }],
              )
              .slice(0, MAX_MATCHES)
        : [];

    const tryOpen = (pick: Pick, clientId: string, approvalId: string | null) =>
        open.mutate(
            { sessionId, clientId, productId: pick.product.id, variantId: pick.variant?.id ?? null, approvalId },
            {
                onSuccess: (r) => {
                    if ("tester_id" in r) {
                        setAsking(null);
                        setQuery("");
                        toast({ title: t("till.testers.opened", { name: pick.label }), variant: "success" });
                    } else if (r.error === "needs_manager") {
                        setAsking({ pick, clientId });
                    } else {
                        toast({ title: t("till.testers.none", { name: pick.label }), variant: "warning" });
                    }
                },
                onError: () => toast({ title: t("till.testers.failed"), variant: "error" }),
            },
        );

    const list = testers.data ?? [];
    const locale = dateLocale(language);

    return (
        <>
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="till-screen md:max-w-2xl">
                <div className="flex flex-col gap-5">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-left">
                            <FlaskConical className="h-5 w-5" aria-hidden="true" />
                            {t("till.testers.title")}
                        </DialogTitle>
                        <DialogDescription className="text-left" dir="auto">
                            {t(isManager ? "till.testers.subtitle" : "till.testers.subtitleStaff")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-2">
                        <label className="flex h-12 items-center gap-3 rounded-2xl border border-[var(--card-border)] px-4 focus-within:border-[var(--ink)]">
                            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("till.testers.search")}
                                aria-label={t("till.testers.search")}
                                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                                dir="auto"
                            />
                        </label>
                        {picks.length > 0 && (
                            <ul className="flex flex-col gap-1">
                                {picks.map((pick) => {
                                    const key = `${pick.product.id}:${pick.variant?.id ?? ""}`;
                                    const busy = open.isPending && open.variables?.productId === pick.product.id && open.variables?.variantId === (pick.variant?.id ?? null);
                                    return (
                                        <li key={key}>
                                            <button
                                                type="button"
                                                disabled={pick.available < 1 || open.isPending}
                                                onClick={() => tryOpen(pick, crypto.randomUUID(), null)}
                                                className="flex h-14 w-full items-center gap-3 rounded-2xl px-2 text-left hover:bg-[var(--card-border)]/30 disabled:opacity-50"
                                            >
                                                <Thumb url={pick.product.image_url} />
                                                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground" dir="auto">{pick.label}</span>
                                                <span className="text-xs tabular-nums text-muted">{t("till.sell.left", { n: pick.available })}</span>
                                                <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold", INK_BUTTON)}>
                                                    {busy ? t("till.testers.opening") : t("till.testers.open")}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.testers.onShelf", { n: list.length })}</p>
                        {testers.isPending ? (
                            <div className="h-16 animate-pulse rounded-2xl bg-[var(--card-border)]/40" aria-busy="true" />
                        ) : list.length === 0 ? (
                            <p className="text-left text-sm text-muted" dir="auto">{t("till.testers.empty")}</p>
                        ) : (
                            <ul className="flex flex-col divide-y divide-[var(--card-border)]">
                                {list.map((x) => (
                                    <li key={x.id} className="flex items-center gap-3 py-2.5">
                                        <Thumb url={x.image_url} />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                                {x.name}
                                                {x.variant_name && <span className="ms-1 font-medium text-muted">{x.variant_name}</span>}
                                            </span>
                                            <span className="text-left text-xs text-muted" dir="auto">
                                                {t("till.testers.since", {
                                                    date: new Date(x.opened_at).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Baghdad" }),
                                                    by: x.opened_by,
                                                })}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            disabled={end.isPending && end.variables?.testerId === x.id}
                                            onClick={() =>
                                                end.mutate(
                                                    { sessionId, testerId: x.id },
                                                    { onError: () => toast({ title: t("till.testers.failed"), variant: "error" }) },
                                                )
                                            }
                                            className="h-11 shrink-0 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground disabled:opacity-50"
                                        >
                                            {t("till.testers.usedUp")}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
            {asking && (
                <TillManagerDialog
                    sessionId={sessionId}
                    managers={managers}
                    reason={t("till.testers.askReason", { name: asking.pick.label })}
                    maxOff={null}
                    onApproved={(approval) => tryOpen(asking.pick, asking.clientId, approval.id)}
                    onClose={() => setAsking(null)}
                />
            )}
        </>
    );
}

function Thumb({ url }: { url: string | null }) {
    return (
        <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
            {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
                <span className="flex h-full items-center justify-center text-muted">
                    <Package className="h-4 w-4" aria-hidden="true" />
                </span>
            )}
        </span>
    );
}
