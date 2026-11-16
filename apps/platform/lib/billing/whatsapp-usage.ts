import { whatsappPurposeOf, type WhatsAppPurpose } from "@scheniders/shared/whatsapp-templates";

export interface WhatsAppMonthEntry {
    template_name: string | null;
    count: number;
    /** Null when the reader may not see the shop's money. */
    charged_iqd: number | null;
}

export interface WhatsAppMonthRow {
    purpose: WhatsAppPurpose | "other";
    count: number;
    iqd: number | null;
}

export interface WhatsAppMonth {
    count: number;
    iqd: number | null;
    rows: WhatsAppMonthRow[];
}

/**
 * This month's messages by what they were for (a template renamed over time
 * still counts as the same purpose), most first. IQD is null when any entry
 * hides it.
 */
export function groupWhatsAppMonth(entries: readonly WhatsAppMonthEntry[]): WhatsAppMonth {
    const showMoney = entries.every((e) => e.charged_iqd !== null);
    const byPurpose = new Map<WhatsAppMonthRow["purpose"], { count: number; iqd: number }>();
    for (const e of entries) {
        const purpose = whatsappPurposeOf(e.template_name);
        const row = byPurpose.get(purpose) ?? { count: 0, iqd: 0 };
        row.count += e.count;
        row.iqd += e.charged_iqd ?? 0;
        byPurpose.set(purpose, row);
    }
    const rows = [...byPurpose.entries()]
        .map(([purpose, r]) => ({ purpose, count: r.count, iqd: showMoney ? r.iqd : null }))
        .sort((a, b) => b.count - a.count);
    const count = rows.reduce((n, r) => n + r.count, 0);
    const iqd = showMoney ? rows.reduce((n, r) => n + (r.iqd ?? 0), 0) : null;
    return { count, iqd, rows };
}
