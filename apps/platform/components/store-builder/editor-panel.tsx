"use client";

import { TemplatePicker } from "./sections/template-picker";
import { HeroEditor } from "./sections/hero-editor";
import { AboutEditor } from "./sections/about-editor";
import { ContactEditor } from "./sections/contact-editor";
import { BrandingEditor } from "./sections/branding-editor";
import { SectionManager } from "./sections/section-manager";
import { SEOEditor } from "./sections/seo-editor";
import { DomainManager } from "./sections/domain-manager";
import { StoreAnalytics } from "./sections/store-analytics";
import { StoreHealthScore } from "./sections/store-health-score";
import { CollapsibleSection } from "@/components/products/editor/collapsible-section";
import {
    LayoutGrid,
    Layers,
    Type,
    Info,
    MessageCircle,
    Palette,
    Search,
    Globe,
    BarChart3,
    HeartPulse,
} from "lucide-react";
import type { UseStoreBuilderReturn } from "@/hooks/use-store-builder";
import { cn } from "@/lib/utils";

interface EditorPanelProps {
    builder: UseStoreBuilderReturn;
    tenantId: string;
    businessName: string;
    storeUrl: string;
    slug: string;
    className?: string;
}

export function EditorPanel({ builder, tenantId, businessName, storeUrl, slug, className }: EditorPanelProps) {
    return (
        <div className={cn("overflow-y-auto", className)}>
            <div className="p-6 space-y-4">
                {/* Draft recovery banner */}
                {builder.hasDraft && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm" role="alert">
                        <span className="text-amber-800 dark:text-amber-200">
                            You have an unsaved draft from a previous session.
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={builder.restoreDraft}
                                aria-label="Restore previous draft"
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                            >
                                Restore
                            </button>
                            <button
                                onClick={builder.dismissDraft}
                                aria-label="Dismiss draft recovery"
                                className="px-3 py-1 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {/* Store Health Score */}
                <CollapsibleSection
                    title="Store Health"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-green) flex items-center justify-center"><HeartPulse className="h-3.5 w-3.5 text-green-700" /></div>}
                    defaultOpen
                >
                    <StoreHealthScore builder={builder} />
                </CollapsibleSection>

                {/* Quick Analytics */}
                <CollapsibleSection
                    title="Analytics (7 Days)"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><BarChart3 className="h-3.5 w-3.5 text-blue-700" /></div>}
                >
                    <StoreAnalytics tenantId={tenantId} />
                </CollapsibleSection>

                {/* Template Picker */}
                <TemplatePicker
                    template={builder.template}
                    onSelect={builder.updateTemplate}
                    businessName={businessName}
                />

                {/* Branding & Theming */}
                <CollapsibleSection
                    title="Branding & Theming"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-purple) flex items-center justify-center"><Palette className="h-3.5 w-3.5 text-purple-700" /></div>}
                >
                    <BrandingEditor
                        designTokens={builder.designTokens}
                        updateDesignTokens={builder.updateDesignTokens}
                        logoUrl={builder.logoUrl}
                        setLogoUrl={builder.setLogoUrl}
                        customCss={builder.customCss}
                        setCustomCss={builder.setCustomCss}
                        tenantId={tenantId}
                    />
                </CollapsibleSection>

                {/* Hero Section */}
                <CollapsibleSection
                    title="Hero Section"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-yellow) flex items-center justify-center"><Type className="h-3.5 w-3.5 text-amber-700" /></div>}
                    defaultOpen
                >
                    <HeroEditor
                        heroTitle={builder.heroTitle}
                        setHeroTitle={builder.setHeroTitle}
                        heroSubtitle={builder.heroSubtitle}
                        setHeroSubtitle={builder.setHeroSubtitle}
                        heroCta={builder.heroCta}
                        setHeroCta={builder.setHeroCta}
                        heroImage={builder.heroImage}
                        setHeroImage={builder.setHeroImage}
                        tenantId={tenantId}
                        businessName={businessName}
                        template={builder.template}
                    />
                </CollapsibleSection>

                {/* About Section */}
                <CollapsibleSection
                    title="About Section"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><Info className="h-3.5 w-3.5 text-blue-700" /></div>}
                >
                    <AboutEditor
                        aboutEnabled={builder.aboutEnabled}
                        setAboutEnabled={builder.setAboutEnabled}
                        aboutTitle={builder.aboutTitle}
                        setAboutTitle={builder.setAboutTitle}
                        aboutBody={builder.aboutBody}
                        setAboutBody={builder.setAboutBody}
                        businessName={businessName}
                        template={builder.template}
                    />
                </CollapsibleSection>

                {/* Contact & Social */}
                <CollapsibleSection
                    title="Contact & Social Links"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-green) flex items-center justify-center"><MessageCircle className="h-3.5 w-3.5 text-green-700" /></div>}
                >
                    <ContactEditor
                        whatsapp={builder.whatsapp}
                        setWhatsapp={builder.setWhatsapp}
                        instagram={builder.instagram}
                        setInstagram={builder.setInstagram}
                        facebook={builder.facebook}
                        setFacebook={builder.setFacebook}
                        tiktok={builder.tiktok}
                        setTiktok={builder.setTiktok}
                        enableWhatsappOrder={builder.enableWhatsappOrder}
                        setEnableWhatsappOrder={builder.setEnableWhatsappOrder}
                    />
                </CollapsibleSection>

                {/* Section Manager (drag-and-drop) */}
                <CollapsibleSection
                    title="Page Sections"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-pink) flex items-center justify-center"><Layers className="h-3.5 w-3.5 text-pink-700" /></div>}
                >
                    <SectionManager builder={builder} tenantId={tenantId} />
                </CollapsibleSection>

                {/* SEO */}
                <CollapsibleSection
                    title="SEO & Metadata"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-orange) flex items-center justify-center"><Search className="h-3.5 w-3.5 text-orange-700" /></div>}
                >
                    <SEOEditor
                        seo={builder.seo}
                        updateSEO={builder.updateSEO}
                        businessName={businessName}
                        storeUrl={storeUrl}
                        tenantId={tenantId}
                    />
                </CollapsibleSection>

                {/* Domain Manager */}
                <CollapsibleSection
                    title="Domain & URL"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><Globe className="h-3.5 w-3.5 text-blue-700" /></div>}
                >
                    <DomainManager
                        tenantId={tenantId}
                        storeUrl={storeUrl}
                        slug={slug}
                    />
                </CollapsibleSection>
            </div>
        </div>
    );
}
