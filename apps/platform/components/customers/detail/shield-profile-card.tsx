"use client";

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useShield } from "@/hooks/use-shield";
import { ShieldNetworkRecord } from "@/components/orders/shield/shield-network-record";
import { SHIELD_TONE } from "@/components/orders/shield/shield-tone";

/**
 * Shield on the customer profile: what other stores saw with this number
 * (never which stores, what was ordered or where). The band pill shows only
 * once two or more other stores have history with the number.
 */
export function ShieldProfileCard({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const shield = useShield(phone, true);
    const network = shield.data ?? null;
    const band = network && network.band !== "none" ? network.band : null;

    return (
        <section data-shield-profile className="bg-(--card-bg) rounded-2xl px-6 py-5 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <header className="mb-3 flex items-center gap-3">
                <ShieldCheck aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-headline font-extrabold text-lg text-foreground">{t("shield.profile.title")}</h3>
                {band && (
                    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", SHIELD_TONE[band].pill)}>
                        {t(`shield.profile.band.${band}`)}
                        {network?.score != null && <span className="font-medium opacity-90"> · {network.score}</span>}
                    </span>
                )}
            </header>
            {shield.isLoading ? (
                <div className="h-10 animate-pulse rounded-lg bg-(--card-border)/40" />
            ) : (
                <div className="grid gap-5">
                    <ShieldNetworkRecord network={network} failed={shield.isError} phone={phone} />
                </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">{t("shield.footer")}</p>
        </section>
    );
}
