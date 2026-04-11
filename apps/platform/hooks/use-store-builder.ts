"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useAutoSave } from "@/hooks/use-auto-save";
import type {
    StoreConfig,
    TemplateName,
    HeroConfig,
    AboutConfig,
    ContactConfig,
    DesignTokens,
    SectionConfig,
    SEOConfig,
} from "@scheniders/shared";

// =============================================
// TYPES
// =============================================

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface CompletionItem {
    key: string;
    label: string;
    labelAr: string;
    complete: boolean;
    points: number;
    sectionId?: string;
}

export interface UseStoreBuilderOptions {
    tenantId: string;
    initialConfig: StoreConfig;
    initialBusinessName: string;
    slug: string;
}

export interface UseStoreBuilderReturn {
    // Config (assembled live)
    config: StoreConfig;

    // Status
    isDirty: boolean;
    saveStatus: SaveStatus;

    // ── Template ──
    template: TemplateName;
    updateTemplate: (t: TemplateName) => void;

    // ── Hero ──
    heroTitle: string;
    setHeroTitle: (v: string) => void;
    heroSubtitle: string;
    setHeroSubtitle: (v: string) => void;
    heroCta: string;
    setHeroCta: (v: string) => void;
    heroImage: string | null;
    setHeroImage: (v: string | null) => void;

    // ── About ──
    aboutEnabled: boolean;
    setAboutEnabled: (v: boolean) => void;
    aboutTitle: string;
    setAboutTitle: (v: string) => void;
    aboutBody: string;
    setAboutBody: (v: string) => void;

    // ── Contact ──
    whatsapp: string;
    setWhatsapp: (v: string) => void;
    instagram: string;
    setInstagram: (v: string) => void;
    facebook: string;
    setFacebook: (v: string) => void;
    tiktok: string;
    setTiktok: (v: string) => void;
    enableWhatsappOrder: boolean;
    setEnableWhatsappOrder: (v: boolean) => void;

    // ── Sections Order ──
    sectionsOrder: string[];
    reorderSections: (ids: string[]) => void;

    // ── Design Tokens ──
    designTokens: DesignTokens;
    updateDesignTokens: (tokens: Partial<DesignTokens>) => void;

    // ── Logo ──
    logoUrl: string | null;
    setLogoUrl: (v: string | null) => void;

    // ── Custom CSS ──
    customCss: string;
    setCustomCss: (v: string) => void;

    // ── Sections (new section-based architecture) ──
    sections: SectionConfig[];
    updateSection: (sectionId: string, data: Partial<SectionConfig>) => void;
    addSection: (section: SectionConfig) => void;
    removeSection: (sectionId: string) => void;
    toggleSection: (sectionId: string, enabled: boolean) => void;

    // ── SEO ──
    seo: SEOConfig;
    updateSEO: (field: keyof SEOConfig, value: string) => void;

    // ── Actions ──
    save: () => Promise<void>;
    publish: () => Promise<void>;
    revert: () => void;
    discard: () => void;

    // ── Undo/Redo ──
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;

    // ── Draft ──
    hasDraft: boolean;
    restoreDraft: () => void;
    dismissDraft: () => void;

    // ── Completion ──
    completionScore: number;
    completionItems: CompletionItem[];

    // ── Storefront URL ──
    businessName: string;
}

// =============================================
// DEFAULT SECTIONS ORDER
// =============================================

const DEFAULT_SECTIONS_ORDER = ["hero", "products", "categories", "about"];

// =============================================
// HISTORY MANAGEMENT
// =============================================

interface HistoryState {
    past: StoreConfig[];
    future: StoreConfig[];
}

const MAX_HISTORY = 50;

// =============================================
// HOOK
// =============================================

export function useStoreBuilder({
    tenantId,
    initialConfig,
    initialBusinessName,
    slug,
}: UseStoreBuilderOptions): UseStoreBuilderReturn {
    const queryClient = useQueryClient();
    const initialConfigRef = useRef(initialConfig);

    // ── Individual form state (matches current page pattern) ──
    const [template, setTemplate] = useState<TemplateName>(initialConfig.template || "general");

    const [heroTitle, setHeroTitle] = useState(initialConfig.hero?.title || "");
    const [heroSubtitle, setHeroSubtitle] = useState(initialConfig.hero?.subtitle || "");
    const [heroCta, setHeroCta] = useState(initialConfig.hero?.cta_text || "");
    const [heroImage, setHeroImage] = useState<string | null>(initialConfig.hero?.image_url || null);

    const [aboutEnabled, setAboutEnabled] = useState(initialConfig.about?.enabled ?? false);
    const [aboutTitle, setAboutTitle] = useState(initialConfig.about?.title || "");
    const [aboutBody, setAboutBody] = useState(initialConfig.about?.body || "");

    const [whatsapp, setWhatsapp] = useState(initialConfig.contact?.whatsapp_number || "");
    const [instagram, setInstagram] = useState(initialConfig.contact?.instagram || "");
    const [facebook, setFacebook] = useState(initialConfig.contact?.facebook || "");
    const [tiktok, setTiktok] = useState(initialConfig.contact?.tiktok || "");
    const [enableWhatsappOrder, setEnableWhatsappOrder] = useState(initialConfig.enable_whatsapp_order ?? false);

    const [sectionsOrder, setSectionsOrder] = useState<string[]>(
        initialConfig.sections_order || DEFAULT_SECTIONS_ORDER
    );

    const [designTokens, setDesignTokens] = useState<DesignTokens>(initialConfig.design_tokens || {});
    const [logoUrl, setLogoUrl] = useState<string | null>(initialConfig.logo_url || null);
    const [customCss, setCustomCss] = useState(initialConfig.custom_css || "");
    const [sections, setSections] = useState<SectionConfig[]>(initialConfig.sections || []);
    const [seo, setSEO] = useState<SEOConfig>(initialConfig.seo || {});

    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

    // ── Assemble config from individual state ──
    const config = useMemo<StoreConfig>(() => ({
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
        sections_order: sectionsOrder,
        design_tokens: Object.keys(designTokens).length > 0 ? designTokens : undefined,
        logo_url: logoUrl || undefined,
        custom_css: customCss.trim() || undefined,
        sections: sections.length > 0 ? sections : undefined,
        seo: Object.keys(seo).some(k => seo[k as keyof SEOConfig]) ? seo : undefined,
    }), [
        template, heroTitle, heroSubtitle, heroCta, heroImage,
        aboutEnabled, aboutTitle, aboutBody,
        whatsapp, instagram, facebook, tiktok, enableWhatsappOrder,
        sectionsOrder, designTokens, logoUrl, customCss, sections, seo,
    ]);

    // ── Dirty detection ──
    const isDirty = useMemo(() => {
        return JSON.stringify(config) !== JSON.stringify(initialConfigRef.current);
    }, [config]);

    // ── History (undo/redo) ──
    const historyRef = useRef<HistoryState>({ past: [], future: [] });
    const skipHistoryRef = useRef(false);

    const pushHistory = useCallback(() => {
        if (skipHistoryRef.current) {
            skipHistoryRef.current = false;
            return;
        }
        const currentConfig = config;
        historyRef.current.past.push(structuredClone(currentConfig));
        if (historyRef.current.past.length > MAX_HISTORY) {
            historyRef.current.past.shift();
        }
        historyRef.current.future = [];
    }, [config]);

    // Push history on meaningful state changes (debounced)
    const lastPushedRef = useRef(JSON.stringify(initialConfig));
    useEffect(() => {
        const serialized = JSON.stringify(config);
        if (serialized !== lastPushedRef.current) {
            // Debounce history push to batch rapid changes (e.g., typing)
            const timer = setTimeout(() => {
                if (!skipHistoryRef.current) {
                    historyRef.current.past.push(structuredClone(JSON.parse(lastPushedRef.current)));
                    if (historyRef.current.past.length > MAX_HISTORY) {
                        historyRef.current.past.shift();
                    }
                    historyRef.current.future = [];
                }
                lastPushedRef.current = serialized;
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [config]);

    const applyConfig = useCallback((c: StoreConfig) => {
        skipHistoryRef.current = true;
        setTemplate(c.template || "general");
        setHeroTitle(c.hero?.title || "");
        setHeroSubtitle(c.hero?.subtitle || "");
        setHeroCta(c.hero?.cta_text || "");
        setHeroImage(c.hero?.image_url || null);
        setAboutEnabled(c.about?.enabled ?? false);
        setAboutTitle(c.about?.title || "");
        setAboutBody(c.about?.body || "");
        setWhatsapp(c.contact?.whatsapp_number || "");
        setInstagram(c.contact?.instagram || "");
        setFacebook(c.contact?.facebook || "");
        setTiktok(c.contact?.tiktok || "");
        setEnableWhatsappOrder(c.enable_whatsapp_order ?? false);
        setSectionsOrder(c.sections_order || DEFAULT_SECTIONS_ORDER);
        setDesignTokens(c.design_tokens || {});
        setLogoUrl(c.logo_url || null);
        setCustomCss(c.custom_css || "");
        setSections(c.sections || []);
        setSEO(c.seo || {});
    }, []);

    const undo = useCallback(() => {
        const { past, future } = historyRef.current;
        if (past.length === 0) return;
        const prev = past.pop()!;
        future.push(structuredClone(JSON.parse(lastPushedRef.current)));
        lastPushedRef.current = JSON.stringify(prev);
        applyConfig(prev);
    }, [applyConfig]);

    const redo = useCallback(() => {
        const { past, future } = historyRef.current;
        if (future.length === 0) return;
        const next = future.pop()!;
        past.push(structuredClone(JSON.parse(lastPushedRef.current)));
        lastPushedRef.current = JSON.stringify(next);
        applyConfig(next);
    }, [applyConfig]);

    const canUndo = historyRef.current.past.length > 0;
    const canRedo = historyRef.current.future.length > 0;

    // ── Keyboard shortcuts for undo/redo ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().includes("MAC");
            const mod = isMac ? e.metaKey : e.ctrlKey;
            if (mod && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (mod && e.key === "z" && e.shiftKey) {
                e.preventDefault();
                redo();
            } else if (mod && e.key === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [undo, redo]);

    // ── Auto-save (localStorage draft) ──
    const autoSave = useAutoSave<StoreConfig>({
        key: `store-builder-draft-${tenantId}`,
        data: config,
        interval: 15000,
        enabled: isDirty,
    });

    // ── Server save mutation ──
    const saveMutation = useMutation({
        mutationFn: async (configToSave: StoreConfig) => {
            const { error } = await supabase
                .from("tenants")
                .update({
                    store_config: configToSave,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", tenantId);
            if (error) throw error;
        },
        onMutate: () => {
            setSaveStatus("saving");
        },
        onSuccess: () => {
            setSaveStatus("saved");
            initialConfigRef.current = structuredClone(config);
            autoSave.clearDraft();
            queryClient.invalidateQueries({ queryKey: ["tenant-store", tenantId] });
            // Reset to idle after 3 seconds
            setTimeout(() => setSaveStatus((prev) => prev === "saved" ? "idle" : prev), 3000);
        },
        onError: (err: Error) => {
            setSaveStatus("error");
            toast.error("Failed to save store settings", err.message);
        },
    });

    // ── Publish mutation (draft → live) ──
    const publishMutation = useMutation({
        mutationFn: async (configToPublish: StoreConfig) => {
            const { error } = await supabase
                .from("tenants")
                .update({
                    store_config: configToPublish,
                    store_config_draft: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", tenantId);
            if (error) throw error;
        },
        onMutate: () => {
            setSaveStatus("saving");
        },
        onSuccess: () => {
            setSaveStatus("saved");
            initialConfigRef.current = structuredClone(config);
            autoSave.clearDraft();
            queryClient.invalidateQueries({ queryKey: ["tenant-store", tenantId] });
            toast.success("Store published successfully");
            setTimeout(() => setSaveStatus((prev) => prev === "saved" ? "idle" : prev), 3000);
        },
        onError: (err: Error) => {
            setSaveStatus("error");
            toast.error("Failed to publish store", err.message);
        },
    });

    // ── Debounced auto-save to server ──
    const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        if (!isDirty) return;

        if (debouncedSaveRef.current) {
            clearTimeout(debouncedSaveRef.current);
        }

        debouncedSaveRef.current = setTimeout(() => {
            saveMutation.mutate(configRef.current);
        }, 2000);

        return () => {
            if (debouncedSaveRef.current) {
                clearTimeout(debouncedSaveRef.current);
            }
        };
    }, [isDirty, config]);

    // ── Actions ──
    const save = useCallback(async () => {
        if (debouncedSaveRef.current) {
            clearTimeout(debouncedSaveRef.current);
        }
        saveMutation.mutate(config);
    }, [config, saveMutation]);

    const publish = useCallback(async () => {
        if (debouncedSaveRef.current) {
            clearTimeout(debouncedSaveRef.current);
        }
        publishMutation.mutate(config);
    }, [config, publishMutation]);

    const revert = useCallback(() => {
        applyConfig(initialConfigRef.current);
        autoSave.clearDraft();
        setSaveStatus("idle");
        toast.success("Changes reverted");
    }, [applyConfig, autoSave]);

    const discard = revert;

    // ── Draft restore ──
    const restoreDraft = useCallback(() => {
        const draft = autoSave.restoreDraft();
        if (draft) {
            applyConfig(draft);
            toast.success("Draft restored");
        }
    }, [autoSave, applyConfig]);

    const dismissDraft = useCallback(() => {
        autoSave.clearDraft();
    }, [autoSave]);

    // ── Granular updaters ──
    const updateDesignTokens = useCallback((tokens: Partial<DesignTokens>) => {
        setDesignTokens((prev) => ({ ...prev, ...tokens }));
    }, []);

    const updateSection = useCallback((sectionId: string, data: Partial<SectionConfig>) => {
        setSections((prev) =>
            prev.map((s) => (s.id === sectionId ? { ...s, ...data } : s))
        );
    }, []);

    const addSection = useCallback((section: SectionConfig) => {
        setSections((prev) => [...prev, section]);
        setSectionsOrder((prev) => [...prev, section.id]);
    }, []);

    const removeSection = useCallback((sectionId: string) => {
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
        setSectionsOrder((prev) => prev.filter((id) => id !== sectionId));
    }, []);

    const toggleSection = useCallback((sectionId: string, enabled: boolean) => {
        setSections((prev) =>
            prev.map((s) => (s.id === sectionId ? { ...s, enabled } : s))
        );
    }, []);

    const updateSEO = useCallback((field: keyof SEOConfig, value: string) => {
        setSEO((prev) => ({ ...prev, [field]: value }));
    }, []);

    const reorderSections = useCallback((ids: string[]) => {
        setSectionsOrder(ids);
    }, []);

    // ── Completion Score ──
    const completionItems = useMemo<CompletionItem[]>(() => [
        {
            key: "logo",
            label: "Upload your logo",
            labelAr: "ارفع شعارك",
            complete: !!logoUrl,
            points: 10,
            sectionId: "branding",
        },
        {
            key: "hero_image",
            label: "Add a hero image",
            labelAr: "أضف صورة البانر",
            complete: !!heroImage,
            points: 10,
            sectionId: "hero",
        },
        {
            key: "hero_title",
            label: "Customize your hero title",
            labelAr: "خصّص عنوان البانر",
            complete: !!heroTitle.trim(),
            points: 5,
            sectionId: "hero",
        },
        {
            key: "about",
            label: "Fill in your About section",
            labelAr: "أكمل قسم من نحن",
            complete: aboutEnabled && (aboutBody?.length || 0) > 50,
            points: 10,
            sectionId: "about",
        },
        {
            key: "whatsapp",
            label: "Add your WhatsApp number",
            labelAr: "أضف رقم الواتساب",
            complete: !!whatsapp.trim(),
            points: 10,
            sectionId: "contact",
        },
        {
            key: "social",
            label: "Add at least one social link",
            labelAr: "أضف رابط وسيلة تواصل واحدة على الأقل",
            complete: !!(instagram.trim() || facebook.trim() || tiktok.trim()),
            points: 5,
            sectionId: "contact",
        },
        {
            key: "seo_title",
            label: "Set your SEO title",
            labelAr: "أضف عنوان SEO",
            complete: !!seo.meta_title?.trim(),
            points: 10,
            sectionId: "seo",
        },
        {
            key: "seo_description",
            label: "Set your SEO description",
            labelAr: "أضف وصف SEO",
            complete: !!seo.meta_description?.trim(),
            points: 10,
            sectionId: "seo",
        },
        {
            key: "colors",
            label: "Customize your brand colors",
            labelAr: "خصّص ألوان علامتك التجارية",
            complete: !!designTokens.colors?.primary,
            points: 5,
            sectionId: "branding",
        },
        {
            key: "sections",
            label: "Enable at least 3 sections",
            labelAr: "فعّل 3 أقسام على الأقل",
            complete: sectionsOrder.length >= 3,
            points: 10,
            sectionId: "sections",
        },
    ], [
        logoUrl, heroImage, heroTitle, aboutEnabled, aboutBody,
        whatsapp, instagram, facebook, tiktok,
        seo, designTokens, sectionsOrder,
    ]);

    const completionScore = useMemo(() => {
        const maxPoints = completionItems.reduce((sum, item) => sum + item.points, 0);
        const earned = completionItems.reduce((sum, item) => sum + (item.complete ? item.points : 0), 0);
        return maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 0;
    }, [completionItems]);

    return {
        config,
        isDirty,
        saveStatus,

        template,
        updateTemplate: setTemplate,

        heroTitle,
        setHeroTitle,
        heroSubtitle,
        setHeroSubtitle,
        heroCta,
        setHeroCta,
        heroImage,
        setHeroImage,

        aboutEnabled,
        setAboutEnabled,
        aboutTitle,
        setAboutTitle,
        aboutBody,
        setAboutBody,

        whatsapp,
        setWhatsapp,
        instagram,
        setInstagram,
        facebook,
        setFacebook,
        tiktok,
        setTiktok,
        enableWhatsappOrder,
        setEnableWhatsappOrder,

        sectionsOrder,
        reorderSections,

        designTokens,
        updateDesignTokens,

        logoUrl,
        setLogoUrl,

        customCss,
        setCustomCss,

        sections,
        updateSection,
        addSection,
        removeSection,
        toggleSection,

        seo,
        updateSEO,

        save,
        publish,
        revert,
        discard,

        undo,
        redo,
        canUndo,
        canRedo,

        hasDraft: autoSave.hasDraft,
        restoreDraft,
        dismissDraft,

        completionScore,
        completionItems,

        businessName: initialBusinessName,
    };
}
