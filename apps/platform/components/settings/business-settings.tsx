"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Building2,
    Save,
    Palette,
    Phone,
    MessageCircle,
    Mail,
    MapPin,
    Globe,
    Crown,
    Calendar,
    Loader2,
    Upload,
    ImageIcon,
    Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface TenantData {
    id: string;
    business_name: string;
    slug: string;
    plan: string;
    status: string;
    trial_ends_at: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    store_config: {
        contact?: { whatsapp_number?: string | null } | null;
        [key: string]: unknown;
    } | null;
    city: string | null;
    address: string | null;
    branding: {
        logo_url: string | null;
        primary_color: string;
        secondary_color: string;
    };
    settings: {
        timezone: string;
        language: string;
        currency: string;
    };
    created_at: string;
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
    starter: { label: "settings.biz.plan.starter", color: "bg-blue-100 text-blue-700" },
    growth: { label: "settings.biz.plan.growth", color: "bg-green-100 text-green-700" },
    professional: { label: "settings.biz.plan.professional", color: "bg-purple-100 text-purple-700" },
    enterprise: { label: "settings.biz.plan.enterprise", color: "bg-amber-100 text-amber-700" },
    // The house tier (never billed). Without its own entry it fell back to "Starter".
    internal: { label: "settings.biz.plan.internal", color: "bg-gray-100 text-gray-700" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    trial: { label: "settings.biz.status.trial", color: "bg-yellow-100 text-yellow-700" },
    active: { label: "settings.biz.status.active", color: "bg-green-100 text-green-700" },
    suspended: { label: "settings.biz.status.suspended", color: "bg-red-100 text-red-700" },
    cancelled: { label: "settings.biz.status.cancelled", color: "bg-gray-100 text-gray-700" },
};

async function fetchTenantData(tenantId: string): Promise<TenantData> {
    const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .single();
    if (error) throw error;
    return data;
}

function computeTrialDays(trialEndsAt: string | null): number | null {
    if (!trialEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function BusinessSettings() {
    const { tenantId } = useAuth();
    const { t } = useLanguage();

    const { data: tenant, isLoading: loading } = useQuery({
        queryKey: ["tenant", tenantId],
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
            <div className="text-center py-20 text-muted-foreground">
                {t("settings.biz.notFound")}
            </div>
        );
    }

    // key={tenant.id} resets form state when tenant changes
    return <BusinessSettingsForm tenant={tenant} tenantId={tenantId!} />;
}

function BusinessSettingsForm({ tenant, tenantId }: { tenant: TenantData; tenantId: string }) {
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    // Initialize form state from tenant data (no useEffect needed)
    const [businessName, setBusinessName] = useState(tenant.business_name || "");
    const [contactEmail, setContactEmail] = useState(tenant.contact_email || "");
    const [contactPhone, setContactPhone] = useState(tenant.contact_phone || "");
    const [whatsappNumber, setWhatsappNumber] = useState(
        tenant.store_config?.contact?.whatsapp_number || "",
    );
    const [city, setCity] = useState(tenant.city || "");
    const [address, setAddress] = useState(tenant.address || "");
    const [primaryColor, setPrimaryColor] = useState(tenant.branding?.primary_color || "#3b82f6");
    const [secondaryColor, setSecondaryColor] = useState(tenant.branding?.secondary_color || "#8b5cf6");
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

    const handleRemoveLogo = () => {
        setLogoUrl(null);
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
                    branding: {
                        ...tenant.branding,
                        logo_url: logoUrl,
                        primary_color: primaryColor,
                        secondary_color: secondaryColor,
                    },
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

    const planInfo = PLAN_LABELS[tenant.plan] || PLAN_LABELS.starter;
    const statusInfo = STATUS_LABELS[tenant.status] || STATUS_LABELS.trial;
    const trialDaysLeft = tenant.status === "trial" ? computeTrialDays(tenant.trial_ends_at) : null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.biz.title")}</h2>
                    <p className="text-sm text-muted-foreground">{t("settings.biz.subtitle")}</p>
                </div>
                <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !businessName.trim()}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t("settings.biz.save")}
                </button>
            </div>

            {/* Plan & Status Banner */}
            <div className="pastel-card p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center">
                        <Crown className="h-4 w-4 text-amber-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{t("settings.biz.subscription")}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", planInfo.color)}>
                        {t("settings.biz.planName", { plan: t(planInfo.label) })}
                    </span>
                    <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", statusInfo.color)}>
                        {t(statusInfo.label)}
                    </span>
                    {trialDaysLeft !== null && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            {t("settings.biz.trialLeft", { days: String(trialDaysLeft) })}
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                        {t("settings.biz.slug")}: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{tenant.slug}</code>
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Business Info */}
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-blue) flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-blue-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.biz.info")}</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                {t("settings.biz.name")} *
                            </label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder={t("settings.biz.namePh")}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                <Mail className="w-3 h-3 inline mr-1" />
                                {t("settings.biz.email")}
                            </label>
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="contact@business.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                <Phone className="w-3 h-3 inline mr-1" />
                                {t("settings.biz.phone")}
                            </label>
                            <input
                                type="tel"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="07XXXXXXXXX"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                <MessageCircle className="w-3 h-3 inline mr-1" />
                                {t("settings.biz.whatsapp")}
                            </label>
                            <input
                                type="tel"
                                value={whatsappNumber}
                                onChange={(e) => setWhatsappNumber(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="07XXXXXXXXX"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {t("settings.biz.whatsappHint")}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    <MapPin className="w-3 h-3 inline mr-1" />
                                    {t("settings.biz.city")}
                                </label>
                                <input
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder={t("settings.biz.cityPh")}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    <Globe className="w-3 h-3 inline mr-1" />
                                    {t("settings.biz.address")}
                                </label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder={t("settings.biz.addressPh")}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Branding */}
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                            <Palette className="h-4 w-4 text-teal-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("settings.biz.branding")}</h3>
                    </div>
                    <div className="space-y-5">
                        {/* Logo Upload */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">
                                {t("settings.biz.logo")}
                            </label>
                            <div className="flex items-center gap-4">
                                {logoUrl ? (
                                    <div className="relative group">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- image URL may be on any host a merchant pasted; next/image only serves allowlisted hosts */}
                                        <img
                                            src={logoUrl}
                                            alt="Logo"
                                            className="w-16 h-16 rounded-xl object-cover border border-(--card-border)"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleRemoveLogo}
                                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                                    <p className="text-[10px] text-muted-foreground mt-1">{t("settings.biz.logoRules")}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">
                                {t("settings.biz.primary")}
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="w-10 h-10 rounded-lg border border-(--card-border) cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="w-28 px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                                <div
                                    className="flex-1 h-10 rounded-xl flex items-center justify-center text-white text-xs font-semibold"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    {t("settings.biz.previewButton")}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">
                                {t("settings.biz.secondary")}
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={secondaryColor}
                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                    className="w-10 h-10 rounded-lg border border-(--card-border) cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={secondaryColor}
                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                    className="w-28 px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                                <div
                                    className="flex-1 h-10 rounded-xl flex items-center justify-center text-white text-xs font-semibold"
                                    style={{ backgroundColor: secondaryColor }}
                                >
                                    {t("settings.biz.previewAccent")}
                                </div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="mt-4 p-4 rounded-xl border border-(--card-border) bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-3">{t("settings.biz.preview")}</p>
                            <div className="flex items-center gap-3">
                                {logoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- image URL may be on any host a merchant pasted; next/image only serves allowlisted hosts
                                    <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
                                ) : (
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        {businessName.charAt(0).toUpperCase() || "B"}
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold text-sm" style={{ color: primaryColor }}>
                                        {businessName || t("settings.biz.yourBusiness")}
                                    </p>
                                    <p className="text-xs" style={{ color: secondaryColor }}>
                                        {tenant.slug}.scheniders.com
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
