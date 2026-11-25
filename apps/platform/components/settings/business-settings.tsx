"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ArrowUpRight,
    Building2,
    Save,
    Palette,
    Phone,
    MessageCircle,
    Mail,
    MapPin,
    Globe,
    Link2,
    Loader2,
    Upload,
    ImageIcon,
    Trash2,
} from "lucide-react";
import { storeAddress } from "@scheniders/shared/store-address";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { ContactSupportButton } from "@/components/support/contact-support-button";
import { SettingsPreviewPane, SettingsWithPreview } from "@/components/settings/settings-preview";
import { StorefrontPreview } from "@/components/settings/storefront-preview";

/** Where the store's colours are edited: the store editor's brand screen, the one the storefront reads. */
export const STORE_COLORS_EDIT_HREF = "/store/edit?screen=brand_kit";

interface TenantData {
    id: string;
    business_name: string;
    slug: string;
    contact_email: string | null;
    contact_phone: string | null;
    store_config: {
        contact?: { whatsapp_number?: string | null } | null;
        [key: string]: unknown;
    } | null;
    store_config_v2: {
        brand_kit?: { colors?: { primary?: string; secondary?: string; accent?: string } | null } | null;
    } | null;
    city: string | null;
    address: string | null;
    branding: {
        logo_url: string | null;
        primary_color?: string;
        secondary_color?: string;
        [key: string]: unknown;
    } | null;
}

async function fetchTenantData(tenantId: string): Promise<TenantData> {
    const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .single();
    if (error) throw error;
    return data;
}

/**
 * The colours the storefront paints with: the store editor's brand colours,
 * else (an older shop that never opened the editor) the legacy branding pair.
 */
export function storeColors(tenant: Pick<TenantData, "store_config_v2" | "branding">): string[] {
    const kit = tenant.store_config_v2?.brand_kit?.colors;
    const picked = kit?.primary
        ? [kit.primary, kit.secondary, kit.accent]
        : [tenant.branding?.primary_color, tenant.branding?.secondary_color];
    return picked.filter((c): c is string => typeof c === "string" && c.trim() !== "");
}

const INPUT =
    "w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

export function BusinessSettings() {
    const { tenantId } = useAuth();
    const { t } = useLanguage();

    const { data: tenant, isLoading: loading } = useQuery({
        // Its own key: useTenant() caches a short row (status, plan…) under
        // ["tenant", tenantId]. Sharing that key gave this form the short row,
        // so it opened blank, and saving it wiped store_config, branding and the
        // contact fields (audit R3 UI-1). The save still invalidates the
        // ["tenant", tenantId] prefix, which refreshes both.
        queryKey: ["tenant", tenantId, "business-settings"],
        queryFn: () => fetchTenantData(tenantId!),
        enabled: !!tenantId,
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {t("settings.biz.loading")}
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
                <p>{t("settings.biz.notFound")}</p>
                <ContactSupportButton errorCode="settings.biz.notFound" errorMessage={t("settings.biz.notFound")} />
            </div>
        );
    }

    return <BusinessSettingsForm tenant={tenant} tenantId={tenantId!} />;
}

function BusinessSettingsForm({ tenant, tenantId }: { tenant: TenantData; tenantId: string }) {
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    const [businessName, setBusinessName] = useState(tenant.business_name || "");
    const [contactEmail, setContactEmail] = useState(tenant.contact_email || "");
    const [contactPhone, setContactPhone] = useState(tenant.contact_phone || "");
    const [whatsappNumber, setWhatsappNumber] = useState(
        tenant.store_config?.contact?.whatsapp_number || "",
    );
    const [city, setCity] = useState(tenant.city || "");
    const [address, setAddress] = useState(tenant.address || "");
    const [logoUrl, setLogoUrl] = useState(tenant.branding?.logo_url || null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleLogoUpload = async (file: File) => {
        if (file.size > 512 * 1024) {
            toast.error(t("settings.biz.logoTooBig"));
            return;
        }
        setIsUploadingLogo(true);
        const ext = file.name.split(".").pop() || "png";
        const path = `${tenantId}/logo-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
            .from("tenant-assets")
            .upload(path, file, { cacheControl: "3600", upsert: true });
        if (uploadError) {
            toast.error(t("settings.biz.uploadFailed"), uploadError.message);
            setIsUploadingLogo(false);
            return;
        }
        const { data: urlData } = supabase.storage.from("tenant-assets").getPublicUrl(path);
        setLogoUrl(urlData.publicUrl);
        setIsUploadingLogo(false);
        toast.success(t("settings.biz.logoUploaded"));
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from("tenants")
                .update({
                    business_name: businessName.trim(),
                    contact_email: contactEmail.trim() || null,
                    contact_phone: contactPhone.trim() || null,
                    // Universal storefront WhatsApp number — every WhatsApp CTA
                    // resolves through store_config.contact.whatsapp_number
                    // (per-button overrides live in the store builder).
                    store_config: {
                        ...(tenant.store_config ?? {}),
                        contact: {
                            ...((tenant.store_config?.contact as Record<string, unknown> | null) ?? {}),
                            whatsapp_number: whatsappNumber.trim() || null,
                        },
                    },
                    city: city.trim() || null,
                    address: address.trim() || null,
                    // Only the logo is edited here; the colours stay as they are
                    // (they are changed in the store editor, STORE_COLORS_EDIT_HREF).
                    branding: { ...(tenant.branding ?? {}), logo_url: logoUrl },
                    updated_at: new Date().toISOString(),
                })
                .eq("id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success(t("settings.biz.saved"));
            queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
        },
        onError: (err: Error) => {
            toast.error(t("settings.biz.saveFailed"), err.message);
        },
    });

    const colors = storeColors(tenant);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.nav.storeInfo")}</h2>
                    <p className="text-sm text-muted-foreground">{t("settings.biz.subtitle")}</p>
                </div>
                <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !businessName.trim()}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t("settings.biz.save")}
                </button>
            </div>

            <SettingsWithPreview
                preview={
                    <SettingsPreviewPane
                        title={t("settings.preview.store")}
                        hint={t("settings.preview.live")}
                        caption={t("settings.preview.storeCaption")}
                    >
                        <StorefrontPreview name={businessName} logoUrl={logoUrl} whatsapp={whatsappNumber} accent={colors[0] ?? null} />
                    </SettingsPreviewPane>
                }
            >
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-blue) flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-blue-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.biz.info")}</h3>
                    </div>
                    <div className="space-y-4">
                        <div data-setting="store-name">
                            <label htmlFor="biz-name" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                {t("settings.biz.name")} *
                            </label>
                            <input
                                id="biz-name"
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                className={INPUT}
                                placeholder={t("settings.biz.namePh")}
                            />
                        </div>
                        <div data-setting="store-whatsapp">
                            <label htmlFor="biz-whatsapp" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                <MessageCircle className="w-3 h-3 inline mr-1" />
                                {t("settings.biz.whatsapp")}
                            </label>
                            <input
                                id="biz-whatsapp"
                                type="tel"
                                value={whatsappNumber}
                                onChange={(e) => setWhatsappNumber(e.target.value)}
                                className={INPUT}
                                placeholder="07XXXXXXXXX"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                <bdi>{t("settings.biz.whatsappHint")}</bdi>
                            </p>
                        </div>
                        <div data-setting="store-contact" className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="biz-phone" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    <Phone className="w-3 h-3 inline mr-1" />
                                    {t("settings.biz.phone")}
                                </label>
                                <input
                                    id="biz-phone"
                                    type="tel"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    className={INPUT}
                                    placeholder="07XXXXXXXXX"
                                />
                            </div>
                            <div>
                                <label htmlFor="biz-email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    <Mail className="w-3 h-3 inline mr-1" />
                                    {t("settings.biz.email")}
                                </label>
                                <input
                                    id="biz-email"
                                    type="email"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    className={INPUT}
                                    placeholder="contact@business.com"
                                />
                            </div>
                        </div>
                        <div data-setting="store-address" className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="biz-city" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    <MapPin className="w-3 h-3 inline mr-1" />
                                    {t("settings.biz.city")}
                                </label>
                                <input
                                    id="biz-city"
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    className={INPUT}
                                    placeholder={t("settings.biz.cityPh")}
                                />
                            </div>
                            <div>
                                <label htmlFor="biz-address" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    <Globe className="w-3 h-3 inline mr-1" />
                                    {t("settings.biz.address")}
                                </label>
                                <input
                                    id="biz-address"
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    className={INPUT}
                                    placeholder={t("settings.biz.addressPh")}
                                />
                            </div>
                        </div>
                        <p className="flex items-center gap-2 border-t border-(--card-border) pt-4 text-xs text-muted-foreground">
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            {t("settings.biz.slug")}:
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                                {storeAddress(tenant.slug, env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN)}
                            </code>
                        </p>
                    </div>
                </div>

                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                            <Palette className="h-4 w-4 text-teal-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.biz.branding")}</h3>
                    </div>
                    <div className="space-y-6">
                        <div data-setting="store-logo">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("settings.biz.logo")}</p>
                            <div className="flex items-center gap-4">
                                {logoUrl ? (
                                    <div className="relative group">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- image URL may be on any host a merchant pasted; next/image only serves allowlisted hosts */}
                                        <img
                                            src={logoUrl}
                                            alt={t("settings.biz.logo")}
                                            className="w-16 h-16 rounded-xl object-cover border border-(--card-border)"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setLogoUrl(null)}
                                            aria-label={t("settings.biz.removeLogo")}
                                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-(--card-border) flex items-center justify-center text-muted-foreground">
                                        <ImageIcon className="w-6 h-6" />
                                    </div>
                                )}
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleLogoUpload(file);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploadingLogo}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--card-border) text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
                                    >
                                        {isUploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {logoUrl ? t("settings.biz.change") : t("settings.biz.upload")}
                                    </button>
                                    <p className="text-[10px] text-muted-foreground mt-1"><bdi>{t("settings.biz.logoRules")}</bdi></p>
                                </div>
                            </div>
                        </div>

                        <div data-setting="store-colors" className="border-t border-(--card-border) pt-5">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("settings.hub.colors.title")}</p>
                            <div className="flex flex-wrap items-center gap-3">
                                {colors.map((c) => (
                                    <span key={c} className="inline-flex items-center gap-2 rounded-lg border border-(--card-border) px-2 py-1">
                                        <span className="h-5 w-5 rounded-md border border-black/10" style={{ backgroundColor: c }} />
                                        <code className="text-xs text-foreground">{c}</code>
                                    </span>
                                ))}
                                <Link
                                    href={STORE_COLORS_EDIT_HREF}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-(--card-border) px-3 text-xs font-semibold text-foreground hover:bg-(--background)"
                                >
                                    {t("settings.biz.colorsEdit")}
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground"><bdi>{t("settings.biz.colorsHint")}</bdi></p>
                        </div>
                    </div>
                </div>
            </SettingsWithPreview>
        </div>
    );
}
