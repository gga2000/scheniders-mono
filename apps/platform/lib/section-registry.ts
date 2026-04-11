// =============================================
// Section Registry for Store Builder
// =============================================
// Defines all available section types, their defaults,
// and metadata used by the section manager UI.

import type { SectionConfig } from "@scheniders/shared";

export interface SectionDefinition {
    type: string;
    label: string;
    labelAr: string;
    icon: string; // Lucide icon name
    defaultData: Record<string, unknown>;
    variants: string[];
    maxInstances: number;
    completionCheck: (data: Record<string, unknown>) => number; // 0-100
}

// ── Section Definitions ──

export const SECTION_REGISTRY: SectionDefinition[] = [
    {
        type: "hero",
        label: "Hero Banner",
        labelAr: "البانر الرئيسي",
        icon: "Image",
        defaultData: {
            title: "",
            subtitle: "",
            cta_text: "",
            image_url: null,
        },
        variants: ["default", "split", "video", "slider"],
        maxInstances: 1,
        completionCheck: (d) => {
            let score = 0;
            if (d.title) score += 40;
            if (d.subtitle) score += 20;
            if (d.cta_text) score += 20;
            if (d.image_url) score += 20;
            return score;
        },
    },
    {
        type: "products",
        label: "Products",
        labelAr: "المنتجات",
        icon: "ShoppingBag",
        defaultData: {
            display: "grid",
            columns: 3,
            limit: 12,
            show_price: true,
        },
        variants: ["grid", "list", "carousel"],
        maxInstances: 1,
        completionCheck: () => 100, // Always "complete" — products come from DB
    },
    {
        type: "categories",
        label: "Categories",
        labelAr: "التصنيفات",
        icon: "LayoutGrid",
        defaultData: {
            display: "pills",
        },
        variants: ["pills", "cards", "icons"],
        maxInstances: 1,
        completionCheck: () => 100,
    },
    {
        type: "about",
        label: "About",
        labelAr: "حول المتجر",
        icon: "Info",
        defaultData: {
            title: "",
            body: "",
        },
        variants: ["default", "side-image", "centered"],
        maxInstances: 1,
        completionCheck: (d) => {
            let score = 0;
            if (d.title) score += 50;
            if (d.body) score += 50;
            return score;
        },
    },
    {
        type: "testimonials",
        label: "Testimonials",
        labelAr: "آراء العملاء",
        icon: "Quote",
        defaultData: {
            items: [
                { name: "", photo: null, rating: 5, quote: "" },
                { name: "", photo: null, rating: 5, quote: "" },
                { name: "", photo: null, rating: 5, quote: "" },
            ],
        },
        variants: ["grid", "carousel", "masonry"],
        maxInstances: 1,
        completionCheck: (d) => {
            const items = (d.items as Array<{ name: string; quote: string }>) || [];
            const filled = items.filter((i) => i.name && i.quote).length;
            return items.length > 0 ? Math.round((filled / items.length) * 100) : 0;
        },
    },
    {
        type: "featured_carousel",
        label: "Featured Products",
        labelAr: "منتجات مميزة",
        icon: "Star",
        defaultData: {
            product_ids: [],
            auto_rotate: true,
            display_count: 4,
            show_price: true,
        },
        variants: ["default", "large-cards"],
        maxInstances: 2,
        completionCheck: (d) => {
            const ids = (d.product_ids as string[]) || [];
            return ids.length > 0 ? 100 : 0;
        },
    },
    {
        type: "newsletter",
        label: "Newsletter",
        labelAr: "النشرة البريدية",
        icon: "Mail",
        defaultData: {
            title: "اشترك في نشرتنا البريدية",
            description: "احصل على آخر العروض والمنتجات الجديدة",
            button_text: "اشتراك",
            placeholder_text: "بريدك الإلكتروني",
        },
        variants: ["default", "inline", "banner"],
        maxInstances: 1,
        completionCheck: (d) => {
            let score = 0;
            if (d.title) score += 50;
            if (d.description) score += 50;
            return score;
        },
    },
    {
        type: "promotions",
        label: "Promotion Banner",
        labelAr: "بانر ترويجي",
        icon: "Megaphone",
        defaultData: {
            text: "",
            background_color: "#3b82f6",
            link_url: "",
            countdown_end: null,
        },
        variants: ["default", "countdown", "gradient"],
        maxInstances: 3,
        completionCheck: (d) => (d.text ? 100 : 0),
    },
    {
        type: "gallery",
        label: "Image Gallery",
        labelAr: "معرض الصور",
        icon: "Images",
        defaultData: {
            images: [],
            layout: "grid",
        },
        variants: ["grid", "masonry"],
        maxInstances: 2,
        completionCheck: (d) => {
            const imgs = (d.images as string[]) || [];
            return imgs.length > 0 ? 100 : 0;
        },
    },
    {
        type: "faq",
        label: "FAQ",
        labelAr: "الأسئلة الشائعة",
        icon: "HelpCircle",
        defaultData: {
            items: [
                { question: "", answer: "" },
                { question: "", answer: "" },
                { question: "", answer: "" },
            ],
        },
        variants: ["default", "two-column"],
        maxInstances: 1,
        completionCheck: (d) => {
            const items = (d.items as Array<{ question: string; answer: string }>) || [];
            const filled = items.filter((i) => i.question && i.answer).length;
            return items.length > 0 ? Math.round((filled / items.length) * 100) : 0;
        },
    },
    {
        type: "policies",
        label: "Policies",
        labelAr: "السياسات",
        icon: "FileText",
        defaultData: {
            shipping: "",
            returns: "",
            privacy: "",
        },
        variants: ["default", "tabs", "accordion"],
        maxInstances: 1,
        completionCheck: (d) => {
            let score = 0;
            if (d.shipping) score += 34;
            if (d.returns) score += 33;
            if (d.privacy) score += 33;
            return score;
        },
    },
    {
        type: "contact",
        label: "Contact",
        labelAr: "التواصل",
        icon: "MessageCircle",
        defaultData: {},
        variants: ["default"],
        maxInstances: 1,
        completionCheck: () => 100, // Contact data comes from top-level fields
    },
];

// ── Helpers ──

export function getSectionDefinition(type: string): SectionDefinition | undefined {
    return SECTION_REGISTRY.find((s) => s.type === type);
}

export function createDefaultSection(type: string): SectionConfig | null {
    const def = getSectionDefinition(type);
    if (!def) return null;
    return {
        id: `${type}-${Date.now()}`,
        type: def.type,
        enabled: true,
        variant: def.variants[0],
        data: { ...def.defaultData },
    };
}

export function getAvailableSectionTypes(existingSections: SectionConfig[]): SectionDefinition[] {
    return SECTION_REGISTRY.filter((def) => {
        const count = existingSections.filter((s) => s.type === def.type).length;
        return count < def.maxInstances;
    });
}
