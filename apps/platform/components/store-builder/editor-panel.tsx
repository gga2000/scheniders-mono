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
import { TestimonialEditor } from "./sections/schneiders/testimonial-editor";
import { SocialProofEditor } from "./sections/schneiders/social-proof-editor";
import { DeliveryPromiseEditor } from "./sections/schneiders/delivery-promise-editor";
import { ShippingEditor } from "./sections/schneiders/shipping-editor";
import { ReassuranceEditor } from "./sections/schneiders/reassurance-editor";
import { PromoBarEditor } from "./sections/schneiders/promo-bar-editor";
import { AnalyticsEditor } from "./sections/schneiders/analytics-editor";
import { AccentPairEditor } from "./sections/schneiders/accent-pair-editor";
import { WedgeIntensityEditor } from "./sections/schneiders/wedge-intensity-editor";
import { WordmarkEditor } from "./sections/schneiders/wordmark-editor";
import { TrustPillsEditor } from "./sections/schneiders/trust-pills-editor";
import { HeroCtasEditor } from "./sections/schneiders/hero-ctas-editor";
import { HomeSectionsEditor } from "./sections/schneiders/home-sections-editor";
import { PDPOptionsEditor } from "./sections/schneiders/pdp-options-editor";
import { CartOptionsEditor } from "./sections/schneiders/cart-options-editor";
import { CheckoutOptionsEditor } from "./sections/schneiders/checkout-options-editor";
import { WhatsAppTemplatesEditor } from "./sections/schneiders/whatsapp-templates-editor";
import { OrderConfirmEditor } from "./sections/schneiders/order-confirm-editor";
import { EmptyStatesEditor } from "./sections/schneiders/empty-states-editor";
import { SaleStickerEditor } from "./sections/schneiders/sale-sticker-editor";
import { BestSellersLabelEditor } from "./sections/schneiders/best-sellers-label-editor";
import { FreeGiftEditor } from "./sections/schneiders/free-gift-editor";
import { NewsletterPopupEditor } from "./sections/schneiders/newsletter-popup-editor";
import { ReturnsPolicyEditor } from "./sections/schneiders/returns-policy-editor";
import { PolicyMetaEditor } from "./sections/schneiders/policy-meta-editor";
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
    Sparkles,
    MessageSquareQuote,
    TrendingUp,
    Truck,
    Package,
    PhoneCall,
    Megaphone,
    Droplet,
    Wand2,
    Tag,
    ShieldCheck,
    MousePointer2,
    SquareStack,
    ShoppingBag,
    ShoppingCart,
    CreditCard,
    BadgePercent,
    Gift,
    Mail,
    PackageCheck,
    HelpCircle,
    RotateCcw,
    CalendarClock,
} from "lucide-react";
import { SCHNEIDERS_DEFAULTS } from "@scheniders/shared";
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
                    storefrontUrl={storeUrl}
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

                {/* Schneiders Template Options */}
                <CollapsibleSection
                    title="Schneiders Template Options"
                    icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-pink) flex items-center justify-center"><Sparkles className="h-3.5 w-3.5 text-rose-700" /></div>}
                    persistKey="schneiders-group"
                >
                    <div className="space-y-3">
                        <CollapsibleSection
                            title="Testimonial"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-pink) flex items-center justify-center"><MessageSquareQuote className="h-3.5 w-3.5 text-rose-700" /></div>}
                            persistKey="schneiders-testimonial"
                        >
                            <TestimonialEditor
                                value={builder.schneiders?.testimonial ?? SCHNEIDERS_DEFAULTS.testimonial}
                                onChange={(next) => builder.updateSchneiders({ testimonial: next })}
                                tenantId={tenantId}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Social-Proof Banner"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-green) flex items-center justify-center"><TrendingUp className="h-3.5 w-3.5 text-green-700" /></div>}
                            persistKey="schneiders-social-proof"
                        >
                            <SocialProofEditor
                                value={builder.schneiders?.social_proof ?? SCHNEIDERS_DEFAULTS.social_proof}
                                onChange={(next) => builder.updateSchneiders({ social_proof: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Delivery Promise"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><Truck className="h-3.5 w-3.5 text-blue-700" /></div>}
                            persistKey="schneiders-delivery-promise"
                        >
                            <DeliveryPromiseEditor
                                value={builder.schneiders?.delivery_promise ?? SCHNEIDERS_DEFAULTS.delivery_promise}
                                onChange={(next) => builder.updateSchneiders({ delivery_promise: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Shipping & Fees"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-yellow) flex items-center justify-center"><Package className="h-3.5 w-3.5 text-amber-700" /></div>}
                            persistKey="schneiders-shipping"
                        >
                            <ShippingEditor
                                value={builder.schneiders?.shipping ?? SCHNEIDERS_DEFAULTS.shipping}
                                onChange={(next) => builder.updateSchneiders({ shipping: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Reassurance"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-mint) flex items-center justify-center"><PhoneCall className="h-3.5 w-3.5 text-emerald-700" /></div>}
                            persistKey="schneiders-reassurance"
                        >
                            <ReassuranceEditor
                                value={builder.schneiders?.reassurance ?? SCHNEIDERS_DEFAULTS.reassurance}
                                onChange={(next) => builder.updateSchneiders({ reassurance: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Promo Bar"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-orange) flex items-center justify-center"><Megaphone className="h-3.5 w-3.5 text-orange-700" /></div>}
                            persistKey="schneiders-promo-bar"
                        >
                            <PromoBarEditor
                                value={builder.schneiders?.promo_bar ?? SCHNEIDERS_DEFAULTS.promo_bar}
                                onChange={(next) => builder.updateSchneiders({ promo_bar: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Analytics & Pixel IDs"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-purple) flex items-center justify-center"><BarChart3 className="h-3.5 w-3.5 text-purple-700" /></div>}
                            persistKey="schneiders-analytics"
                        >
                            <AnalyticsEditor
                                value={builder.schneiders?.analytics ?? SCHNEIDERS_DEFAULTS.analytics}
                                onChange={(next) => builder.updateSchneiders({ analytics: next })}
                            />
                        </CollapsibleSection>

                        {/* ── Tier 2 — Brand controls ── */}

                        <CollapsibleSection
                            title="Accent Color Pair"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-pink) flex items-center justify-center"><Droplet className="h-3.5 w-3.5 text-rose-700" /></div>}
                            persistKey="schneiders-accent-pair"
                        >
                            <AccentPairEditor
                                value={builder.schneiders?.accent_pair ?? SCHNEIDERS_DEFAULTS.accent_pair}
                                onChange={(next) => builder.updateSchneiders({ accent_pair: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Wedge Intensity"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-yellow) flex items-center justify-center"><Wand2 className="h-3.5 w-3.5 text-amber-700" /></div>}
                            persistKey="schneiders-wedge-intensity"
                        >
                            <WedgeIntensityEditor
                                value={builder.schneiders?.wedge_intensity ?? SCHNEIDERS_DEFAULTS.wedge_intensity}
                                onChange={(next) => builder.updateSchneiders({ wedge_intensity: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Wordmark Style"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-orange) flex items-center justify-center"><Type className="h-3.5 w-3.5 text-orange-700" /></div>}
                            persistKey="schneiders-wordmark"
                        >
                            <WordmarkEditor
                                value={builder.schneiders?.wordmark_style ?? SCHNEIDERS_DEFAULTS.wordmark_style}
                                onChange={(next) => builder.updateSchneiders({ wordmark_style: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Trust Pills"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-mint) flex items-center justify-center"><ShieldCheck className="h-3.5 w-3.5 text-emerald-700" /></div>}
                            persistKey="schneiders-trust-pills"
                        >
                            <TrustPillsEditor
                                value={builder.schneiders?.trust_pills ?? SCHNEIDERS_DEFAULTS.trust_pills}
                                onChange={(next) => builder.updateSchneiders({ trust_pills: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Hero CTAs"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><MousePointer2 className="h-3.5 w-3.5 text-blue-700" /></div>}
                            persistKey="schneiders-hero-ctas"
                        >
                            <HeroCtasEditor
                                value={builder.schneiders?.hero_ctas ?? SCHNEIDERS_DEFAULTS.hero_ctas}
                                onChange={(next) => builder.updateSchneiders({ hero_ctas: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Home Sections"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-purple) flex items-center justify-center"><SquareStack className="h-3.5 w-3.5 text-purple-700" /></div>}
                            persistKey="schneiders-home-sections"
                        >
                            <HomeSectionsEditor
                                value={builder.schneiders?.home_sections ?? SCHNEIDERS_DEFAULTS.home_sections}
                                onChange={(next) => builder.updateSchneiders({ home_sections: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="PDP Options"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-pink) flex items-center justify-center"><ShoppingBag className="h-3.5 w-3.5 text-rose-700" /></div>}
                            persistKey="schneiders-pdp"
                        >
                            <PDPOptionsEditor
                                value={builder.schneiders?.pdp ?? SCHNEIDERS_DEFAULTS.pdp}
                                onChange={(next) => builder.updateSchneiders({ pdp: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Cart Options"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-green) flex items-center justify-center"><ShoppingCart className="h-3.5 w-3.5 text-green-700" /></div>}
                            persistKey="schneiders-cart"
                        >
                            <CartOptionsEditor
                                value={builder.schneiders?.cart ?? SCHNEIDERS_DEFAULTS.cart}
                                onChange={(next) => builder.updateSchneiders({ cart: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Checkout Options"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-yellow) flex items-center justify-center"><CreditCard className="h-3.5 w-3.5 text-amber-700" /></div>}
                            persistKey="schneiders-checkout"
                        >
                            <CheckoutOptionsEditor
                                value={builder.schneiders?.checkout ?? SCHNEIDERS_DEFAULTS.checkout}
                                onChange={(next) => builder.updateSchneiders({ checkout: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="WhatsApp Templates"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-mint) flex items-center justify-center"><MessageCircle className="h-3.5 w-3.5 text-emerald-700" /></div>}
                            persistKey="schneiders-wa-templates"
                        >
                            <WhatsAppTemplatesEditor
                                value={builder.schneiders?.whatsapp_templates ?? SCHNEIDERS_DEFAULTS.whatsapp_templates}
                                onChange={(next) => builder.updateSchneiders({ whatsapp_templates: next })}
                            />
                        </CollapsibleSection>

                        {/* ── Tier 3 — Polish ── */}

                        <CollapsibleSection
                            title="Order Confirmation"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-mint) flex items-center justify-center"><PackageCheck className="h-3.5 w-3.5 text-emerald-700" /></div>}
                            persistKey="schneiders-order-confirm"
                        >
                            <OrderConfirmEditor
                                value={builder.schneiders?.order_confirm ?? SCHNEIDERS_DEFAULTS.order_confirm}
                                onChange={(next) => builder.updateSchneiders({ order_confirm: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Empty States & 404"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><HelpCircle className="h-3.5 w-3.5 text-blue-700" /></div>}
                            persistKey="schneiders-empty-states"
                        >
                            <EmptyStatesEditor
                                value={builder.schneiders?.empty_states ?? SCHNEIDERS_DEFAULTS.empty_states}
                                onChange={(next) => builder.updateSchneiders({ empty_states: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Sale Sticker"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-pink) flex items-center justify-center"><BadgePercent className="h-3.5 w-3.5 text-rose-700" /></div>}
                            persistKey="schneiders-sale-sticker"
                        >
                            <SaleStickerEditor
                                value={builder.schneiders?.sale_sticker ?? SCHNEIDERS_DEFAULTS.sale_sticker}
                                onChange={(next) => builder.updateSchneiders({ sale_sticker: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Best Sellers Label"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-yellow) flex items-center justify-center"><Tag className="h-3.5 w-3.5 text-amber-700" /></div>}
                            persistKey="schneiders-best-sellers"
                        >
                            <BestSellersLabelEditor
                                value={builder.schneiders?.best_sellers_label ?? SCHNEIDERS_DEFAULTS.best_sellers_label}
                                onChange={(next) => builder.updateSchneiders({ best_sellers_label: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Free Gift Threshold"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-purple) flex items-center justify-center"><Gift className="h-3.5 w-3.5 text-purple-700" /></div>}
                            persistKey="schneiders-free-gift"
                        >
                            <FreeGiftEditor
                                value={builder.schneiders?.free_gift ?? SCHNEIDERS_DEFAULTS.free_gift}
                                onChange={(next) => builder.updateSchneiders({ free_gift: next })}
                                tenantId={tenantId}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Newsletter Popup"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-green) flex items-center justify-center"><Mail className="h-3.5 w-3.5 text-green-700" /></div>}
                            persistKey="schneiders-newsletter-popup"
                        >
                            <NewsletterPopupEditor
                                value={builder.schneiders?.newsletter_popup ?? SCHNEIDERS_DEFAULTS.newsletter_popup}
                                onChange={(next) => builder.updateSchneiders({ newsletter_popup: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Returns Policy"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-purple) flex items-center justify-center"><RotateCcw className="h-3.5 w-3.5 text-purple-700" /></div>}
                            persistKey="schneiders-returns-policy"
                        >
                            <ReturnsPolicyEditor
                                value={builder.schneiders?.returns_policy ?? SCHNEIDERS_DEFAULTS.returns_policy}
                                onChange={(next) => builder.updateSchneiders({ returns_policy: next })}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="Policy Last-Updated"
                            icon={<div className="w-6 h-6 rounded-lg bg-(--pastel-blue) flex items-center justify-center"><CalendarClock className="h-3.5 w-3.5 text-blue-700" /></div>}
                            persistKey="schneiders-policy-meta"
                        >
                            <PolicyMetaEditor
                                value={builder.schneiders?.policy_meta ?? SCHNEIDERS_DEFAULTS.policy_meta}
                                onChange={(next) => builder.updateSchneiders({ policy_meta: next })}
                            />
                        </CollapsibleSection>
                    </div>
                </CollapsibleSection>
            </div>
        </div>
    );
}
