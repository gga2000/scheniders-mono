"use client";

import { useState } from "react";
import { FileText, Loader2, Printer } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { fetchMonthlyInvoice } from "@/lib/billing/fetch-monthly-invoice";
import { monthlyInvoiceDocument, monthRange, recentMonths } from "@/lib/billing/monthly-invoice";
import { printHtmlDocument } from "@/lib/print-html";

const MONTHS_SHOWN = 6;

/** "November 2026" / «تشرين الثاني 2026», with Latin digits. */
function monthName(month: string, language: string): string {
    return new Date(monthRange(month).start).toLocaleDateString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Baghdad",
    });
}

export function MonthlyInvoices({ tenantId, displayId }: { tenantId: string; displayId: number | null }) {
    const { t, language } = useLanguage();
    const [printing, setPrinting] = useState<string | null>(null);
    const months = recentMonths(new Date(), MONTHS_SHOWN);

    async function print(month: string) {
        setPrinting(month);
        try {
            const invoice = await fetchMonthlyInvoice(supabase, { id: tenantId, displayId }, month);
            printHtmlDocument(monthlyInvoiceDocument(invoice));
        } catch {
            toast.error(t("billing.invoices.error"));
        } finally {
            setPrinting(null);
        }
    }

    return (
        <div className="pastel-card p-6">
            <div className="mb-1 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-blue)">
                    <FileText className="h-4 w-4 text-sky-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t("billing.invoices.title")}</h3>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{t("billing.invoices.subtitle")}</p>
            <div className="divide-y divide-(--card-border)">
                {months.map((month, i) => (
                    <div key={month} className="flex items-center justify-between py-2.5">
                        <p className="text-sm font-medium text-foreground">
                            {monthName(month, language)}
                            {i === 0 && <span className="ms-2 text-xs font-normal text-muted-foreground">{t("billing.invoices.soFar")}</span>}
                        </p>
                        <button
                            type="button"
                            onClick={() => print(month)}
                            disabled={printing !== null}
                            className="flex items-center gap-1.5 rounded-lg border border-(--card-border) px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                            data-testid={`invoice-print-${month}`}
                        >
                            {printing === month ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                            {t("billing.invoices.print")}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
