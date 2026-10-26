"use client";

import { Badge } from "@scheniders/ui";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useOpenStoreCaptures } from "@/hooks/use-open-store-captures";

/**
 * Store captures in the orders «متروكة» tab: phones a shopper typed on the
 * store's order form without placing the order. They live in
 * abandoned_carts, not in orders, so the pending_checkout rows beside them,
 * and those rows' statuses and counts, stay exactly as they were. Staff
 * call or message these by hand; nothing here sends anything. The panel
 * renders nothing while there are no open captures, so the tab looks
 * unchanged for every store that has none.
 */
export function StoreCapturesPanel() {
    const { t, language } = useLanguage();
    const { data: captures = [], isError } = useOpenStoreCaptures();

    if (isError) {
        return (
            <p
                role="alert"
                className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
            >
                {t("orders.captures.loadFailed")}
            </p>
        );
    }
    if (captures.length === 0) return null;

    const when = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
        timeStyle: "short",
    });

    return (
        <section
            data-testid="store-captures"
            aria-labelledby="store-captures-title"
            className="rounded-2xl border border-border bg-card p-4"
        >
            <h2 id="store-captures-title" className="text-sm font-bold text-foreground">
                {t("orders.captures.title")}{" "}
                <span className="tabular-nums text-muted-foreground">({captures.length})</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("orders.captures.hint")}</p>
            <ul className="mt-3 space-y-2">
                {captures.map((c) => {
                    const governorate = c.governorate
                        ? IRAQ_GOVERNORATES.find((g) => g.code === c.governorate)
                        : undefined;
                    return (
                        <li
                            key={c.id}
                            data-testid="store-capture"
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <a
                                        href={`tel:${c.phone}`}
                                        dir="ltr"
                                        className="font-medium tabular-nums text-foreground underline-offset-2 hover:underline"
                                    >
                                        {c.phone}
                                    </a>
                                    <Badge variant={c.consent_at ? "contacted" : "default"}>
                                        {c.consent_at
                                            ? t("orders.captures.consent")
                                            : t("orders.captures.noConsent")}
                                    </Badge>
                                </div>
                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                    {c.items
                                        .map((i) => `${i.name} × ${i.quantity}`)
                                        .join(t("orders.captures.itemSeparator"))}
                                    {governorate
                                        ? ` · ${language === "ar" ? governorate.name : governorate.name_en}`
                                        : ""}
                                </p>
                            </div>
                            <div className="text-end">
                                <p className="font-bold tabular-nums text-foreground">
                                    {formatIQD(c.subtotal_iqd)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {when.format(new Date(c.updated_at))}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
