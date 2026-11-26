"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Truck } from "lucide-react";
import {
    FLAT_DELIVERY_FEE_IQD,
    FREE_DELIVERY_THRESHOLD_IQD,
    IRAQ_GOVERNORATES,
    computeDeliveryFee,
    resolveShippingRate,
    type GovernorateCode,
    type GovernorateShippingConfig,
} from "@scheniders/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsPreviewPane, SettingsWithPreview } from "@/components/settings/settings-preview";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";

/** Where the fees are edited: the store editor's shipping screen, the one checkout reads. */
export const DELIVERY_FEES_EDIT_HREF = "/store/edit?screen=shipping";

export interface GovernorateFee {
    code: GovernorateCode;
    nameAr: string;
    nameEn: string;
    fee: number;
    /** 0 = never free. */
    freeFrom: number;
}

/**
 * Each governorate's fee exactly as checkout prices it (computeDeliveryFee):
 * its own rate, else the shop's default rate, else the platform's flat fee.
 */
export function governorateFees(shipping: GovernorateShippingConfig | null): GovernorateFee[] {
    return IRAQ_GOVERNORATES.map((g) => {
        const rate = resolveShippingRate(shipping, g.code);
        return {
            code: g.code,
            nameAr: g.name,
            nameEn: g.name_en,
            fee: rate ? Math.max(0, Math.round(rate.fee_iqd)) : FLAT_DELIVERY_FEE_IQD,
            freeFrom: rate ? (rate.free_threshold_iqd ?? 0) : FREE_DELIVERY_THRESHOLD_IQD,
        };
    });
}

/** Baghdad's fee and the lowest and highest fee of the other governorates, for the overview line. */
export function feesAtAGlance(fees: readonly GovernorateFee[]): { baghdad: number; otherMin: number; otherMax: number } {
    const baghdad = fees.find((g) => g.code === "BG")?.fee ?? FLAT_DELIVERY_FEE_IQD;
    const others = fees.filter((g) => g.code !== "BG").map((g) => g.fee);
    return {
        baghdad,
        otherMin: others.length ? Math.min(...others) : baghdad,
        otherMax: others.length ? Math.max(...others) : baghdad,
    };
}

/** Cart sizes the checkout preview offers: the sample order's product, then two bigger carts. */
export const PREVIEW_CARTS_IQD = [32_000, 80_000, 150_000] as const;

/** The shop's published shipping config (tenants.store_config_v2.commerce.shipping), or null when it has none. */
export function useStoreShipping() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["tenant", tenantId, "shipping"],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<GovernorateShippingConfig | null> => {
            const { data, error } = await supabase
                .from("tenants")
                .select("shipping:store_config_v2->commerce->shipping")
                .eq("id", tenantId!)
                .maybeSingle();
            if (error) throw error;
            const shipping = (data as { shipping: GovernorateShippingConfig | null } | null)?.shipping;
            return shipping && typeof shipping === "object" ? shipping : null;
        },
    });
}

/**
 * Settings › Delivery fees. Shows the fees checkout really charges, per
 * governorate, and sends the merchant to the store editor to change them.
 * (The old form here saved to a setting nothing read.)
 */
export function DeliveryFeesSummary() {
    const { t, language } = useLanguage();
    const { data: shipping, isLoading } = useStoreShipping();
    const [picked, setPicked] = useState<GovernorateCode>("BA");
    const [cart, setCart] = useState<number>(PREVIEW_CARTS_IQD[0]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading")}
            </div>
        );
    }

    const fees = governorateFees(shipping ?? null);

    return (
        <div className="space-y-4" data-setting="delivery-fees">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.orders.fees")}</h2>
                    <p className="text-sm text-muted-foreground">{t("settings.fees.subtitle")}</p>
                </div>
                <Link
                    href={DELIVERY_FEES_EDIT_HREF}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                    {t("settings.fees.edit")}
                    <ArrowUpRight className="h-4 w-4" />
                </Link>
            </div>

            {!shipping && (
                <p className="rounded-xl border border-(--card-border) bg-(--background-soft) px-4 py-3 text-sm text-foreground">
                    <bdi>{t("settings.fees.standard", { fee: formatIQD(FLAT_DELIVERY_FEE_IQD), free: formatIQD(FREE_DELIVERY_THRESHOLD_IQD) })}</bdi>
                </p>
            )}

            <SettingsWithPreview
                preview={
                    <SettingsPreviewPane
                        title={t("settings.preview.checkout")}
                        hint={t("settings.preview.pickGov")}
                        caption={t("settings.preview.checkoutCaption")}
                    >
                        <CheckoutPreview fees={fees} shipping={shipping ?? null} code={picked} onCode={setPicked} cart={cart} onCart={setCart} />
                    </SettingsPreviewPane>
                }
            >
                <div className="pastel-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-(--card-border) text-xs text-muted-foreground">
                                <th className="p-3 text-start font-medium">{t("settings.fees.col.governorate")}</th>
                                <th className="p-3 text-start font-medium">{t("settings.fees.col.fee")}</th>
                                <th className="p-3 text-start font-medium">{t("settings.fees.col.free")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fees.map((g) => (
                                <tr
                                    key={g.code}
                                    className={cn(
                                        "border-b border-(--card-border) last:border-0",
                                        g.code === picked && "bg-(--pastel-yellow)/40",
                                    )}
                                >
                                    <td className="p-0 font-medium text-foreground">
                                        <button
                                            type="button"
                                            onClick={() => setPicked(g.code)}
                                            aria-pressed={g.code === picked}
                                            className="w-full p-3 text-start hover:underline"
                                        >
                                            {language === "en" ? g.nameEn : g.nameAr}
                                        </button>
                                    </td>
                                    <td className="p-3 tabular-nums text-foreground">
                                        {g.fee === 0 ? t("settings.fees.free") : formatIQD(g.fee)}
                                    </td>
                                    <td className="p-3 tabular-nums text-muted-foreground">
                                        {g.fee === 0 ? "—" : g.freeFrom > 0 ? formatIQD(g.freeFrom) : t("settings.fees.never")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SettingsWithPreview>

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Truck className="h-3.5 w-3.5" />
                <bdi>{t("settings.fees.note")}</bdi>
            </p>
        </div>
    );
}

/**
 * The money part of checkout for one governorate and cart, priced by the same
 * computeDeliveryFee the storefront charges with.
 */
function CheckoutPreview({
    fees,
    shipping,
    code,
    onCode,
    cart,
    onCart,
}: {
    fees: readonly GovernorateFee[];
    shipping: GovernorateShippingConfig | null;
    code: GovernorateCode;
    onCode: (code: GovernorateCode) => void;
    cart: number;
    onCart: (iqd: number) => void;
}) {
    const { t, language } = useLanguage();
    const gov = fees.find((g) => g.code === code) ?? fees[0];
    const fee = computeDeliveryFee(cart, 1, { shipping, governorate: code });
    const freeByCart = fee === 0 && gov.fee > 0;
    const name = (g: GovernorateFee) => (language === "en" ? g.nameEn : g.nameAr);

    return (
        <div className="space-y-3">
            <select
                aria-label={t("settings.fees.col.governorate")}
                value={code}
                onChange={(e) => {
                    const next = fees.find((g) => g.code === e.target.value);
                    if (next) onCode(next.code);
                }}
                className="h-9 w-full rounded-xl border border-(--card-border) bg-background px-2 text-sm text-foreground"
            >
                {fees.map((g) => (
                    <option key={g.code} value={g.code}>{name(g)}</option>
                ))}
            </select>
            <div role="radiogroup" aria-label={t("settings.preview.cart")} className="flex items-center gap-1 rounded-xl bg-(--background) p-1">
                {PREVIEW_CARTS_IQD.map((iqd) => (
                    <button
                        key={iqd}
                        type="button"
                        role="radio"
                        aria-checked={cart === iqd}
                        onClick={() => onCart(iqd)}
                        className={cn(
                            "h-7 flex-1 rounded-lg text-xs font-semibold tabular-nums transition-colors",
                            cart === iqd ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {formatIQD(iqd)}
                    </button>
                ))}
            </div>
            <div aria-live="polite" className="space-y-2 rounded-xl border border-(--card-border) bg-background p-3 text-sm">
                <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("settings.preview.products")}</span>
                    <span className="tabular-nums text-foreground">{formatIQD(cart)}</span>
                </div>
                <div className="-mx-1.5 flex justify-between gap-2 rounded-lg bg-(--pastel-yellow)/50 px-1.5 py-1">
                    <span className="text-foreground"><bdi>{t("settings.preview.deliveryTo", { gov: name(gov) })}</bdi></span>
                    <span className="font-semibold tabular-nums text-foreground">{fee === 0 ? t("settings.fees.free") : formatIQD(fee)}</span>
                </div>
                <div className="flex justify-between gap-2 border-t border-(--card-border) pt-2 font-semibold">
                    <span className="text-foreground">{t("settings.preview.total")}</span>
                    <span className="tabular-nums text-foreground">{formatIQD(cart + fee)}</span>
                </div>
            </div>
            {gov.fee > 0 && (
                <p className="text-xs text-muted-foreground">
                    <bdi>
                        {freeByCart
                            ? t("settings.preview.freeReached", { amount: formatIQD(gov.freeFrom) })
                            : gov.freeFrom > 0
                              ? t("settings.preview.freeFrom", { amount: formatIQD(gov.freeFrom) })
                              : t("settings.preview.neverFree")}
                    </bdi>
                </p>
            )}
        </div>
    );
}
