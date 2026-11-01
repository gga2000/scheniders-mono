"use client";

import { PenLine } from "lucide-react";
import type { Order } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { cn } from "@/lib/utils";

/** Imports put many orders in at once; their source chip already says so. */
const IMPORT_SOURCES: ReadonlySet<NonNullable<Order["source"]>> = new Set(["excel_import", "prime", "delivery_import"]);

/**
 * A pen beside the source chip: a staff member typed this order in. `source`
 * stays where the customer came from; `entered_by` says who entered it.
 */
export function EnteredByMark({ enteredBy, source, className }: {
    enteredBy: Order["entered_by"];
    source: Order["source"];
    className?: string;
}) {
    if (!enteredBy || (source && IMPORT_SOURCES.has(source))) return null;
    return <EnteredByPill enteredBy={enteredBy} className={className} />;
}

/**
 * Split out so only cards that carry the mark subscribe to the team list; a
 * long list of unmarked orders renders without touching the query.
 */
function EnteredByPill({ enteredBy, className }: { enteredBy: string; className?: string }) {
    const { t } = useLanguage();
    const { data: members } = useTenantMembers();
    const name = members?.find((m) => m.user_id === enteredBy)?.display_name;
    const label = name ? t("orders.enteredBy.named").replace("{name}", name) : t("orders.enteredBy.staff");

    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600", className)}
        >
            <PenLine className="h-3 w-3" aria-hidden="true" />
        </span>
    );
}
