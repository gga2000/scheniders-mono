import { z } from "zod";

/**
 * What whatsapp_watch() returns (20261116055117_fermi_whatsapp_guard.sql): the
 * database's 15-minute look at WhatsApp across every shop. It has already
 * paused the shops listed in `paused`; this side only raises the alerts.
 */
export const whatsappWatchSchema = z.object({
    interakt_empty_since: z.string().nullable(),
    hour: z.object({ reached: z.number().int(), failed: z.number().int() }),
    spike: z.boolean(),
    paused: z.array(
        z.object({
            tenant_id: z.string().uuid(),
            display_id: z.number().int().nullable(),
            name: z.string().nullable(),
            paused_at: z.string(),
            reached: z.number().int(),
            bad: z.number().int(),
        }),
    ),
});

export type WhatsAppWatch = z.infer<typeof whatsappWatchSchema>;

export interface WhatsAppAlert {
    kind: "interakt-empty" | "failure-spike" | "shop-paused";
    message: string;
    /**
     * One Sentry issue per incident. Sentry emails the team on an issue's
     * first event (alert rule "Prod: new or returning problem"), so each new
     * incident is one email and the runs that see the same incident add to it.
     */
    fingerprint: string[];
    extra: Record<string, string | number | null>;
}

/** The day in Baghdad, so a failure spike emails at most once a day. */
export function baghdadDay(now: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(now);
}

/** The alerts this run should raise. No customer data: shop numbers only. */
export function whatsappAlerts(watch: WhatsAppWatch, now: Date): WhatsAppAlert[] {
    const alerts: WhatsAppAlert[] = [];
    if (watch.interakt_empty_since) {
        alerts.push({
            kind: "interakt-empty",
            message: "Interakt balance is empty: no shop's WhatsApp messages are going out. Top up Interakt.",
            fingerprint: ["whatsapp-alert", "interakt-empty", watch.interakt_empty_since],
            extra: { since: watch.interakt_empty_since },
        });
    }
    if (watch.spike) {
        alerts.push({
            kind: "failure-spike",
            message: `WhatsApp failures spiked: ${watch.hour.failed} of ${watch.hour.reached} messages failed in the last hour`,
            fingerprint: ["whatsapp-alert", "failure-spike", baghdadDay(now)],
            extra: { failed: watch.hour.failed, reached: watch.hour.reached },
        });
    }
    for (const shop of watch.paused) {
        alerts.push({
            kind: "shop-paused",
            message: `WhatsApp paused for shop #${shop.display_id ?? shop.tenant_id}: ${shop.bad} of ${shop.reached} messages in 24 hours did not reach customers`,
            fingerprint: ["whatsapp-alert", "shop-paused", shop.tenant_id, shop.paused_at],
            extra: { tenant_id: shop.tenant_id, shop: shop.name, reached: shop.reached, bad: shop.bad },
        });
    }
    return alerts;
}
