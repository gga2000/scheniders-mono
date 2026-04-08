"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Store,
    Save,
    ExternalLink,
    Loader2,
    Upload,
    ImageIcon,
    Trash2,
    Shirt,
    Sparkles,
    Cpu,
    LayoutGrid,
    Minus,
    Type,
    MessageCircle,
    Info,
    Globe,
    // Social icons
    Phone,
    Instagram,
    Facebook,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

// =============================================
// TYPES
// =============================================

type TemplateName = "fashion" | "beauty" | "electronics" | "general" | "clean";

interface StoreConfig {
    template?: TemplateName;
    hero?: {
        title?: string;
        subtitle?: string;
        cta_text?: string;
        image_url?: string;
    };
    about?: {
        enabled?: boolean;
        title?: string;
        body?: string;
    };
    contact?: {
        whatsapp_number?: string;
        instagram?: string;
        facebook?: string;
        tiktok?: string;
    };
    sections_order?: string[];
    enable_whatsapp_order?: boolean;
}

interface TenantStoreData {
    id: string;
    slug: string;
    business_name: string;
    store_config: StoreConfig | null;
}

// =============================================
// TEMPLATE DEFINITIONS
// =============================================

const TEMPLATES: {
    id: TemplateName;
    name: string;
    description: string;
    icon: typeof Shirt;
    colorVar: string;
    iconColor: string;
}[] = [
    {
        id: "fashion",
        name: "Fashion",
        description: "Bold layouts for clothing & accessories",
        icon: Shirt,
        colorVar: "--pastel-pink",
        iconColor: "text-rose-700",
    },
    {
        id: "beauty",
        name: "Beauty",
        description: "Elegant design for cosmetics & skincare",
        icon: Sparkles,
        colorVar: "--pastel-purple",
        iconColor: "text-purple-700",
    },
    {
        id: "electronics",
        name: "Electronics",
        description: "Modern tech-focused product showcase",
        icon: Cpu,
        colorVar: "--pastel-blue",
        iconColor: "text-blue-700",
    },
    {
        id: "general",
        name: "General",
        description: "Versatile layout for any product type",
        icon: LayoutGrid,
        colorVar: "--pastel-yellow",
        iconColor: "text-amber-700",
    },
    {
        id: "clean",
        name: "Clean",
        description: "Minimal, distraction-free storefront",
        icon: Minus,
        colorVar: "--pastel-mint",
        iconColor: "text-teal-700",
    },
];

// =============================================
// STOREFRONT URL HELPER
// =============================================

function useStorefrontUrl(slug: string, tenantId: string | null) {
    const { data: customDomain } = useQuery({
        queryKey: ["tenant-domain", tenantId],
        queryFn: async () => {
            if (!tenantId) return null;
            const { data } = await supabase
                .from("tenant_domains")
                .select("domain, verified")
                .eq("tenant_id", tenantId)
                .eq("verified", true)
                .limit(1)
                .maybeSingle();
            return data?.domain ?? null;
        },
        enabled: !!tenantId,
        staleTime: 1000 * 60 * 10,
    });

    const rootDomain = env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN;

    // Priority: verified custom domain > subdomain > path-based fallback
    if (customDomain) {
        return `https://${customDomain}`;
    }

    // Check if wildcard DNS is likely available (production domain, not localhost)
    if (rootDomain && !rootDomain.includes("localhost")) {
        return `https://${slug}.${rootDomain}`;
    }

    // Dev fallback: path-based
    const protocol = rootDomain?.includes("localhost") ? "http" : "https";
    return `${protocol}://${rootDomain}/s/${slug}`;
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function StoreBuilderPage() {
    const { tenantId } = useAuth();

    const { data: tenant, isLoading } = useQuery({
        queryKey: ["tenant-store", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("id, slug, business_name, store_config")
                .eq("id", tenantId!)
                .single();
            if (error) throw error;
            return data as TenantStoreData;
        },
        enabled: !!tenantId,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading store builder...
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                No store found. Please contact support.
            </div>
        );
    }

    return <StoreBuilderForm tenant={tenant} tenantId={tenantId!} />;
}

// =============================================
// FORM COMPONENT
// =============================================

function StoreBuilderForm({
    tenant,
    tenantId,
}: {
    tenant: TenantStoreData;
    tenantId: string;
}) {
    const queryClient = useQueryClient();
    const config = tenant.store_config || {};

    // ── Form state ──
    const [template, setTemplate] = useState<TemplateName>(config.template || "general");

    const [heroTitle, setHeroTitle] = useState(config.hero?.title || "");
    const [heroSubtitle, setHeroSubtitle] = useState(config.hero?.subtitle || "");
    const [heroCta, setHeroCta] = useState(config.hero?.cta_text || "");
    const [heroImage, setHeroImage] = useState<string | null>(config.hero?.image_url || null);

    const [aboutEnabled, setAboutEnabled] = useState(config.about?.enabled ?? false);
    const [aboutTitle, setAboutTitle] = useState(config.about?.title || "");
    const [aboutBody, setAboutBody] = useState(config.about?.body || "");

    const [whatsapp, setWhatsapp] = useState(config.contact?.whatsapp_number || "");
    const [instagram, setInstagram] = useState(config.contact?.instagram || "");
    const [facebook, setFacebook] = useState(config.contact?.facebook || "");
    const [tiktok, setTiktok] = useState(config.contact?.tiktok || "");
    const [enableWhatsappOrder, setEnableWhatsappOrder] = useState(
        config.enable_whatsapp_order ?? false
    );

    const [isUploadingHero, setIsUploadingHero] = useState(false);
    const heroInputRef = useRef<HTMLInputElement>(null);

    const storefrontUrl = useStorefrontUrl(tenant.slug, tenantId);

    // ── Hero Image Upload ──
    const handleHeroUpload = useCallback(
        async (file: File) => {
            if (file.size > 2 * 1024 * 1024) {
                toast.error("Hero image must be under 2MB");
                return;
            }
            setIsUploadingHero(true);
            const ext = file.name.split(".").pop() || "png";
            const path = `${tenantId}/hero-${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage
                .from("tenant-assets")
                .upload(path, file, { cacheControl: "3600", upsert: true });
            if (uploadError) {
                toast.error("Upload failed", uploadError.message);
                setIsUploadingHero(false);
                return;
            }
            const { data: urlData } = supabase.storage
                .from("tenant-assets")
                .getPublicUrl(path);
            setHeroImage(urlData.publicUrl);
            setIsUploadingHero(false);
            toast.success("Hero image uploaded");
        },
        [tenantId]
    );

    // ── Save Mutation ──
    const saveMutation = useMutation({
        mutationFn: async () => {
            const newConfig: StoreConfig = {
                template,
                hero: {
                    title: heroTitle.trim() || undefined,
                    subtitle: heroSubtitle.trim() || undefined,
                    cta_text: heroCta.trim() || undefined,
                    image_url: heroImage || undefined,
                },
                about: {
                    enabled: aboutEnabled,
                    title: aboutTitle.trim() || undefined,
                    body: aboutBody.trim() || undefined,
                },
                contact: {
                    whatsapp_number: whatsapp.trim() || undefined,
                    instagram: instagram.trim() || undefined,
                    facebook: facebook.trim() || undefined,
                    tiktok: tiktok.trim() || undefined,
                },
                enable_whatsapp_order: enableWhatsappOrder,
            };

            const { error } = await supabase
                .from("tenants")
                .update({
                    store_config: newConfig,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Store settings saved");
            queryClient.invalidateQueries({ queryKey: ["tenant-store", tenantId] });
        },
        onError: (err: Error) => {
            toast.error("Failed to save", err.message);
        },
    });

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
            {/* ── Page Header ── */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-(--pastel-mint) flex items-center justify-center shadow-sm">
                        <Store className="w-5 h-5 text-teal-700" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground leading-tight">
                            Store Builder
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Configure your public storefront
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => window.open(storefrontUrl, "_blank")}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border border-(--card-border) bg-background hover:bg-(--pastel-mint) hover:text-teal-700"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Preview Store
                    </button>
                    <button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                            "bg-primary text-primary-foreground hover:bg-primary/90",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        {saveMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Changes
                    </button>
                </div>
            </div>

            {/* ── Scrollable Content ── */}
            <main className="flex-1 overflow-y-auto px-6 pb-8">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* ════════════ 1. TEMPLATE PICKER ════════════ */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-(--pastel-purple) flex items-center justify-center">
                                <LayoutGrid className="h-4 w-4 text-purple-700" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    Template
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                    Choose a layout for your storefront
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {TEMPLATES.map((tmpl) => {
                                const Icon = tmpl.icon;
                                const isSelected = template === tmpl.id;
                                return (
                                    <button
                                        key={tmpl.id}
                                        onClick={() => setTemplate(tmpl.id)}
                                        className={cn(
                                            "pastel-card p-4 flex flex-col items-center gap-3 text-center transition-all duration-200 rounded-2xl border-2 group cursor-pointer",
                                            isSelected
                                                ? "border-primary shadow-lg"
                                                : "border-transparent hover:border-(--card-border)"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "h-12 w-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                                            )}
                                            style={{
                                                background: `var(${tmpl.colorVar})`,
                                            }}
                                        >
                                            <Icon
                                                className={cn(
                                                    "h-5 w-5",
                                                    tmpl.iconColor
                                                )}
                                            />
                                        </div>
                                        <div>
                                            <p
                                                className={cn(
                                                    "font-semibold text-sm",
                                                    isSelected
                                                        ? "text-foreground"
                                                        : "text-foreground/80"
                                                )}
                                            >
                                                {tmpl.name}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                                {tmpl.description}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <div className="flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-(--button-success)" />
                                                <span className="text-[10px] text-(--button-success) font-semibold uppercase tracking-wide">
                                                    Active
                                                </span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* ════════════ 2. HERO SECTION ════════════ */}
                    <section className="pastel-card p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center">
                                <Type className="h-4 w-4 text-amber-700" />
                            </div>
                            <h2 className="text-base font-semibold text-foreground">
                                Hero Section
                            </h2>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        Title
                                    </label>
                                    <input
                                        type="text"
                                        value={heroTitle}
                                        onChange={(e) =>
                                            setHeroTitle(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Welcome to our store"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        Subtitle
                                    </label>
                                    <input
                                        type="text"
                                        value={heroSubtitle}
                                        onChange={(e) =>
                                            setHeroSubtitle(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Discover our latest collection"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    CTA Button Text
                                </label>
                                <input
                                    type="text"
                                    value={heroCta}
                                    onChange={(e) =>
                                        setHeroCta(e.target.value)
                                    }
                                    className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-xs"
                                    placeholder="Shop Now"
                                />
                            </div>

                            {/* Hero Image Upload */}
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-2">
                                    Hero Image
                                </label>
                                <div className="flex items-start gap-4">
                                    {heroImage ? (
                                        <div className="relative group">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={heroImage}
                                                alt="Hero"
                                                className="w-40 h-24 rounded-xl object-cover border border-(--card-border)"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setHeroImage(null)
                                                }
                                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="w-40 h-24 rounded-xl border-2 border-dashed border-(--card-border) flex items-center justify-center text-muted-foreground">
                                            <ImageIcon className="w-8 h-8" />
                                        </div>
                                    )}
                                    <div>
                                        <input
                                            ref={heroInputRef}
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file =
                                                    e.target.files?.[0];
                                                if (file)
                                                    handleHeroUpload(file);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                heroInputRef.current?.click()
                                            }
                                            disabled={isUploadingHero}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--card-border) text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
                                        >
                                            {isUploadingHero ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Upload className="w-3.5 h-3.5" />
                                            )}
                                            {heroImage ? "Change" : "Upload"}
                                        </button>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            PNG, JPG, WebP. Max 2MB.
                                            Recommended: 1920×600
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ════════════ 3. ABOUT SECTION ════════════ */}
                    <section className="pastel-card p-6">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-(--pastel-blue) flex items-center justify-center">
                                    <Info className="h-4 w-4 text-blue-700" />
                                </div>
                                <h2 className="text-base font-semibold text-foreground">
                                    About Section
                                </h2>
                            </div>
                            <button
                                onClick={() => setAboutEnabled(!aboutEnabled)}
                                className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0",
                                    aboutEnabled
                                        ? "bg-(--button-success)"
                                        : "bg-gray-200 dark:bg-gray-600"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                        aboutEnabled
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>

                        {aboutEnabled && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        Title
                                    </label>
                                    <input
                                        type="text"
                                        value={aboutTitle}
                                        onChange={(e) =>
                                            setAboutTitle(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="About Us"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        Body
                                    </label>
                                    <textarea
                                        value={aboutBody}
                                        onChange={(e) =>
                                            setAboutBody(e.target.value)
                                        }
                                        rows={4}
                                        className="flex min-h-[100px] w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200 resize-none"
                                        placeholder="Tell your customers about your brand, story, and what makes you unique…"
                                    />
                                </div>
                            </div>
                        )}

                        {!aboutEnabled && (
                            <p className="text-sm text-muted-foreground">
                                About section is hidden on your storefront.
                                Toggle on to configure.
                            </p>
                        )}
                    </section>

                    {/* ════════════ 4. CONTACT & SOCIAL ════════════ */}
                    <section className="pastel-card p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-(--pastel-green) flex items-center justify-center">
                                <MessageCircle className="h-4 w-4 text-green-700" />
                            </div>
                            <h2 className="text-base font-semibold text-foreground">
                                Contact & Social Links
                            </h2>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        <Phone className="w-3 h-3 inline mr-1" />
                                        WhatsApp Number
                                    </label>
                                    <input
                                        type="tel"
                                        value={whatsapp}
                                        onChange={(e) =>
                                            setWhatsapp(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="9647XXXXXXXXX"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        <Instagram className="w-3 h-3 inline mr-1" />
                                        Instagram
                                    </label>
                                    <input
                                        type="text"
                                        value={instagram}
                                        onChange={(e) =>
                                            setInstagram(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="@yourbrand"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        <Facebook className="w-3 h-3 inline mr-1" />
                                        Facebook
                                    </label>
                                    <input
                                        type="text"
                                        value={facebook}
                                        onChange={(e) =>
                                            setFacebook(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="facebook.com/yourbrand"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                        <svg
                                            className="w-3 h-3 inline mr-1"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.4a6.27 6.27 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15.3 6.34 6.34 0 0 0 9.5 21.63a6.34 6.34 0 0 0 6.34-6.34V8.1a8.16 8.16 0 0 0 4.75 1.52V6.2a4.83 4.83 0 0 1-1-.03v.52Z" />
                                        </svg>
                                        TikTok
                                    </label>
                                    <input
                                        type="text"
                                        value={tiktok}
                                        onChange={(e) =>
                                            setTiktok(e.target.value)
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="@yourbrand"
                                    />
                                </div>
                            </div>

                            {/* WhatsApp Order Toggle */}
                            <div className="flex items-center justify-between pt-4 border-t border-(--card-border)">
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        WhatsApp Ordering
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Allow customers to place orders via
                                        WhatsApp
                                    </p>
                                </div>
                                <button
                                    onClick={() =>
                                        setEnableWhatsappOrder(
                                            !enableWhatsappOrder
                                        )
                                    }
                                    className={cn(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0",
                                        enableWhatsappOrder
                                            ? "bg-(--button-success)"
                                            : "bg-gray-200 dark:bg-gray-600"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                                            enableWhatsappOrder
                                                ? "translate-x-6"
                                                : "translate-x-1"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* ════════════ 5. PREVIEW BANNER ════════════ */}
                    <section className="pastel-card p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                                <Globe className="h-4 w-4 text-teal-700" />
                            </div>
                            <h2 className="text-base font-semibold text-foreground">
                                Your Storefront
                            </h2>
                        </div>
                        <div className="p-4 rounded-xl border border-(--card-border) bg-muted/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {tenant.business_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono mt-1">
                                        {storefrontUrl}
                                    </p>
                                </div>
                                <button
                                    onClick={() =>
                                        window.open(storefrontUrl, "_blank")
                                    }
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-(--button-success) text-white hover:bg-(--button-success-hover) shadow-sm"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open Store
                                </button>
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-3">
                            Remember to save changes above before previewing.
                            Changes typically appear within a few seconds.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
