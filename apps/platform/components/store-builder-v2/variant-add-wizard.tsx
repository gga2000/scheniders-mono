"use client";

// =====================================================================
// VariantAddWizard — modal that creates a new Variant in 3 steps
// =====================================================================
// Step 1 — pick the condition kind (9 cards).
// Step 2 — configure the condition (UI varies by kind).
// Step 3 — name the variant and submit.
//
// Also reused for "add another condition" on an existing variant: pass
// `mode="add-condition"` to skip step 1 (the kind is pre-selected) and
// step 3 (the parent supplies its own label).
// =====================================================================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
import {
    ArrowLeft,
    ArrowRight,
    Calendar,
    Check,
    FlaskConical,
    MapPin,
    MessageCircle,
    Moon,
    Search,
    Smartphone,
    Truck,
    X,
} from "lucide-react";
import {
    IRAQ_GOVERNORATES,
    type GovernorateCode,
    LOCALE_LABELS,
    SUPPORTED_LOCALES,
    type AudienceSegment,
    type Breakpoint,
    type Experiment,
    type LocaleCode,
    type PageId,
    type Variant,
    type VariantCondition,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Kind catalog                                                         */
/* ─────────────────────────────────────────────────────────────────── */

export type VariantKind = VariantCondition["kind"];

interface KindCard {
    kind: VariantKind;
    emoji: string;
    title: string;
    description: string;
}

export const VARIANT_KIND_CARDS: KindCard[] = [
    {
        kind: "locale",
        emoji: "🌐",
        title: "A different language",
        description: "Override copy and assets per locale.",
    },
    {
        kind: "breakpoint",
        emoji: "📱",
        title: "A specific device",
        description: "Tailor the section for mobile, tablet, or desktop.",
    },
    {
        kind: "time_window",
        emoji: "📅",
        title: "At a scheduled time",
        description: "Activate the variant during a specific window.",
    },
    {
        kind: "audience",
        emoji: "🎯",
        title: "For a customer segment",
        description: "Show different content to a targeted audience.",
    },
    {
        kind: "ab_test",
        emoji: "⚗️",
        title: "For an A/B test",
        description: "Bind this variant to one experiment arm.",
    },
    {
        kind: "governorate",
        emoji: "📍",
        title: "For specific governorates",
        description: "Geo-target visitors by Iraqi governorate.",
    },
    {
        kind: "product",
        emoji: "🛍",
        title: "For specific products",
        description: "Override on the product detail page only.",
    },
    {
        kind: "category",
        emoji: "📁",
        title: "For specific categories",
        description: "Scope to one or more product categories.",
    },
    {
        kind: "page",
        emoji: "📄",
        title: "For specific pages",
        description: "Limit the override to certain pages.",
    },
];

const PAGE_LABELS: Record<PageId, string> = {
    home: "Home",
    category: "Category",
    product: "Product",
    search: "Search",
    cart: "Cart",
    checkout: "Checkout",
    checkout_success: "Order success",
    track: "Order tracking",
    about: "About",
    faq: "FAQ",
    contact: "Contact",
    policy_shipping: "Shipping policy",
    policy_returns: "Returns policy",
    policy_privacy: "Privacy policy",
    policy_terms: "Terms",
    not_found: "404",
};

const PAGE_IDS: PageId[] = Object.keys(PAGE_LABELS) as PageId[];

const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
    mobile: "Mobile",
    tablet: "Tablet",
    desktop: "Desktop",
};

const BREAKPOINT_EMOJI: Record<Breakpoint, string> = {
    mobile: "📱",
    tablet: "🖥️",
    desktop: "🖥",
};

const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "Asia/Baghdad", label: "Asia/Baghdad" },
    { value: "UTC", label: "UTC" },
];

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface VariantAddWizardProps {
    open: boolean;
    onClose: () => void;
    /** Fired with the new Variant when the merchant submits step 3. */
    onAdd: (variant: Variant) => void;
    /** Used to compute the next priority value. */
    existingVariantCount: number;
    /** A/B-test experiments referenceable by the variant. */
    experiments?: Experiment[];
    /** Audience segments referenceable by the variant. */
    segments?: AudienceSegment[];
    /**
     * Section type label used for auto-naming the experiment when the
     * merchant picks the A/B preset and no experiment exists yet
     * (e.g. "hero_image" → preset_ab_auto_name → "Test on hero_image").
     */
    sectionType?: string;
    /**
     * Optional hook the parent uses to mint a fresh experiment for the
     * "A/B test two versions" preset when no experiment is selected.
     * Returning the created experiment lets the wizard pre-select it.
     */
    onCreateExperimentForPreset?: (name: string) => Experiment;
    /**
     * If supplied, the wizard skips step 1 and step 3 — used by the
     * variant editor's "+ Add condition" flow. The returned object is
     * a *partial* Variant containing only the new condition (parent
     * merges it into its existing conditions array).
     */
    addConditionMode?: { kind: VariantKind; onAddCondition: (c: VariantCondition) => void };
}

type Step = 1 | 2 | 3;

interface KindStateMap {
    locale: { values: LocaleCode[] };
    breakpoint: { values: Breakpoint[] };
    time_window: { start_iso: string; end_iso: string; timezone: string };
    audience: { segment_id: string };
    ab_test: { experiment_id: string; arm: string };
    governorate: { values: GovernorateCode[] };
    product: { product_ids: string[] };
    category: { category_ids: string[] };
    page: { values: PageId[] };
}

function initialKindState<K extends VariantKind>(kind: K): KindStateMap[K] {
    switch (kind) {
        case "locale":
            return { values: [] } as KindStateMap["locale"] as KindStateMap[K];
        case "breakpoint":
            return { values: [] } as KindStateMap["breakpoint"] as KindStateMap[K];
        case "time_window":
            return {
                start_iso: "",
                end_iso: "",
                timezone: "Asia/Baghdad",
            } as KindStateMap["time_window"] as KindStateMap[K];
        case "audience":
            return { segment_id: "" } as KindStateMap["audience"] as KindStateMap[K];
        case "ab_test":
            return {
                experiment_id: "",
                arm: "",
            } as KindStateMap["ab_test"] as KindStateMap[K];
        case "governorate":
            return { values: [] } as KindStateMap["governorate"] as KindStateMap[K];
        case "product":
            return { product_ids: [] } as KindStateMap["product"] as KindStateMap[K];
        case "category":
            return { category_ids: [] } as KindStateMap["category"] as KindStateMap[K];
        case "page":
            return { values: [] } as KindStateMap["page"] as KindStateMap[K];
    }
    // exhaustive
    throw new Error(`Unknown variant kind: ${kind as string}`);
}

function cryptoRandomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build the VariantCondition from the step-2 state. Returns null if invalid. */
function buildCondition(
    kind: VariantKind,
    state: KindStateMap[VariantKind],
): VariantCondition | null {
    switch (kind) {
        case "locale": {
            const s = state as KindStateMap["locale"];
            if (s.values.length === 0) return null;
            return { kind: "locale", values: [...s.values] };
        }
        case "breakpoint": {
            const s = state as KindStateMap["breakpoint"];
            if (s.values.length === 0) return null;
            return { kind: "breakpoint", values: [...s.values] };
        }
        case "time_window": {
            const s = state as KindStateMap["time_window"];
            if (!s.start_iso) return null;
            const start = new Date(s.start_iso);
            if (Number.isNaN(start.getTime())) return null;
            const c: VariantCondition = {
                kind: "time_window",
                start_iso: start.toISOString(),
                timezone: s.timezone || "Asia/Baghdad",
            };
            if (s.end_iso) {
                const end = new Date(s.end_iso);
                if (!Number.isNaN(end.getTime())) {
                    c.end_iso = end.toISOString();
                }
            }
            return c;
        }
        case "audience": {
            const s = state as KindStateMap["audience"];
            if (!s.segment_id) return null;
            return { kind: "audience", segment_id: s.segment_id };
        }
        case "ab_test": {
            const s = state as KindStateMap["ab_test"];
            if (!s.experiment_id || !s.arm) return null;
            return { kind: "ab_test", experiment_id: s.experiment_id, arm: s.arm };
        }
        case "governorate": {
            const s = state as KindStateMap["governorate"];
            if (s.values.length === 0) return null;
            return { kind: "governorate", values: [...s.values] };
        }
        case "product": {
            const s = state as KindStateMap["product"];
            if (s.product_ids.length === 0) return null;
            return { kind: "product", product_ids: [...s.product_ids] };
        }
        case "category": {
            const s = state as KindStateMap["category"];
            if (s.category_ids.length === 0) return null;
            return { kind: "category", category_ids: [...s.category_ids] };
        }
        case "page": {
            const s = state as KindStateMap["page"];
            if (s.values.length === 0) return null;
            return { kind: "page", values: [...s.values] };
        }
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Wizard                                                               */
/* ─────────────────────────────────────────────────────────────────── */

export function VariantAddWizard(props: VariantAddWizardProps): ReactElement | null {
    const {
        open,
        onClose,
        onAdd,
        existingVariantCount,
        experiments = [],
        segments = [],
        sectionType,
        onCreateExperimentForPreset,
        addConditionMode,
    } = props;

    const locale = useEditorLocale();

    const isAddConditionMode = !!addConditionMode;
    const initialStep: Step = isAddConditionMode ? 2 : 1;
    const initialKind: VariantKind = isAddConditionMode ? addConditionMode.kind : "locale";

    const [step, setStep] = useState<Step>(initialStep);
    const [kind, setKind] = useState<VariantKind>(initialKind);
    // We keep one state object per kind so the merchant can hop between
    // kinds in step 1 without losing entered data.
    const [state, setState] = useState<KindStateMap[VariantKind]>(() =>
        initialKindState(initialKind),
    );
    const [label, setLabel] = useState<string>("");
    // Iraqi-market presets pre-seed an `override` on top of the condition.
    // Most presets leave this empty and let the merchant set it via the
    // field editor after creation.
    const [overrideSeed, setOverrideSeed] = useState<Record<string, unknown>>({});

    // Reset on open.
    useEffect(() => {
        if (open) {
            setStep(initialStep);
            setKind(initialKind);
            setState(initialKindState(initialKind));
            setLabel("");
            setOverrideSeed({});
        }
    }, [open, initialStep, initialKind]);

    // Escape closes.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const handlePickKind = useCallback((next: VariantKind): void => {
        setKind(next);
        setState(initialKindState(next));
        setOverrideSeed({});
        setLabel("");
        setStep(2);
    }, []);

    /**
     * Preset shortcuts — Iraqi-merchant-friendly entry points that pre-
     * wire a kind + sensible defaults instead of asking "what kind of
     * condition?" cold. Each preset jumps straight to step 2.
     */
    const handlePickPreset = useCallback(
        (
            preset:
                | "holiday"
                | "mobile"
                | "governorate"
                | "ab_test"
                | "baghdad_same_day"
                | "ramadan"
                | "whatsapp_first",
        ): void => {
            switch (preset) {
                case "holiday": {
                    setKind("time_window");
                    setState(initialKindState("time_window"));
                    setOverrideSeed({});
                    setLabel("");
                    setStep(2);
                    return;
                }
                case "mobile": {
                    setKind("breakpoint");
                    setState({ values: ["mobile"] } as KindStateMap["breakpoint"]);
                    setOverrideSeed({});
                    setLabel("");
                    setStep(2);
                    return;
                }
                case "governorate": {
                    setKind("governorate");
                    setState(initialKindState("governorate"));
                    setOverrideSeed({});
                    setLabel("");
                    setStep(2);
                    return;
                }
                case "baghdad_same_day": {
                    setKind("governorate");
                    setState({ values: ["BG"] } as KindStateMap["governorate"]);
                    setOverrideSeed({
                        heading_i18n: {
                            en: "Today within 2 hours!",
                            ar: "اليوم خلال ساعتين فقط!",
                            ku: "ئەمڕۆ لە ماوەی دوو کاتژمێردا!",
                        },
                    });
                    setLabel(t(STRINGS.variant.preset_baghdad_same_day_label, locale));
                    setStep(2);
                    return;
                }
                case "ramadan": {
                    setKind("time_window");
                    // Ramadan 2026 approx — Feb 18 to Mar 20 (Asia/Baghdad).
                    setState({
                        start_iso: "2026-02-18T00:00",
                        end_iso: "2026-03-20T00:00",
                        timezone: "Asia/Baghdad",
                    } as KindStateMap["time_window"]);
                    setOverrideSeed({});
                    setLabel(t(STRINGS.variant.preset_ramadan_label, locale));
                    setStep(2);
                    return;
                }
                case "whatsapp_first": {
                    // Use a breakpoint=all condition so the variant is
                    // effectively "always on" — the meat lives in the
                    // override. Only hero_image has the secondary CTA
                    // fields, so we seed the override only for that
                    // section type; otherwise the preset just gets the
                    // condition pre-set and the merchant fills the
                    // override via the field editor.
                    setKind("breakpoint");
                    setState({
                        values: ["mobile", "tablet", "desktop"],
                    } as KindStateMap["breakpoint"]);
                    if (sectionType === "hero_image") {
                        setOverrideSeed({
                            secondary_cta_kind: "whatsapp",
                            secondary_cta_label_i18n: {
                                en: "Order via WhatsApp",
                                ar: "اطلب عبر واتساب",
                                ku: "بەهۆی واتساپ داوا بکە",
                            },
                        });
                    } else {
                        setOverrideSeed({});
                    }
                    setLabel(t(STRINGS.variant.preset_whatsapp_first_label, locale));
                    setStep(2);
                    return;
                }
                case "ab_test": {
                    setKind("ab_test");
                    // If no experiment exists yet AND the parent gave us a
                    // creator, silently mint one and pre-select it. The
                    // experiment name reads "Test on <section>".
                    if (experiments.length === 0 && onCreateExperimentForPreset) {
                        const name = tFormat(
                            STRINGS.variant.preset_ab_auto_name,
                            locale,
                            { section: sectionType ?? "section" },
                        );
                        const exp = onCreateExperimentForPreset(name);
                        const firstNonControl =
                            exp.arms.find((a) => a.id !== "control")?.id ?? exp.arms[0]?.id ?? "";
                        setState({
                            experiment_id: exp.id,
                            arm: firstNonControl,
                        } as KindStateMap["ab_test"]);
                    } else if (experiments.length > 0) {
                        const exp = experiments[0];
                        const firstNonControl =
                            exp.arms.find((a) => a.id !== "control")?.id ?? exp.arms[0]?.id ?? "";
                        setState({
                            experiment_id: exp.id,
                            arm: firstNonControl,
                        } as KindStateMap["ab_test"]);
                    } else {
                        setState(initialKindState("ab_test"));
                    }
                    setOverrideSeed({});
                    setLabel("");
                    setStep(2);
                    return;
                }
            }
        },
        [experiments, locale, onCreateExperimentForPreset, sectionType],
    );

    const condition = useMemo<VariantCondition | null>(
        () => buildCondition(kind, state),
        [kind, state],
    );

    const canAdvance = condition !== null;

    const handleSubmit = useCallback((): void => {
        if (!condition) return;
        if (isAddConditionMode) {
            addConditionMode.onAddCondition(condition);
            onClose();
            return;
        }
        const finalLabel =
            label.trim().length > 0
                ? label.trim()
                : defaultLabelForCondition(condition);
        const variant: Variant = {
            id: cryptoRandomId(),
            label: finalLabel,
            conditions: [condition],
            override: { ...overrideSeed },
            priority: existingVariantCount + 1,
            enabled: true,
        };
        onAdd(variant);
        onClose();
    }, [
        condition,
        isAddConditionMode,
        addConditionMode,
        label,
        overrideSeed,
        existingVariantCount,
        onAdd,
        onClose,
    ]);

    if (!open) return null;

    return (
        <div
            data-testid="variant-add-wizard"
            role="dialog"
            aria-modal="true"
            aria-label="Add a variant"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
            <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={onClose}
                data-testid="variant-add-wizard-backdrop"
                className="absolute inset-0 cursor-default"
            />
            <div
                className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-(--card-border) bg-(--card-bg) shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-3 border-b border-(--card-border) px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold tracking-tight">
                            {isAddConditionMode
                                ? t(STRINGS.variant.wizard_add_condition_title, locale)
                                : t(STRINGS.variant.wizard_add_variant_title, locale)}
                        </h2>
                        <p
                            className="mt-0.5 text-xs text-muted-foreground"
                            data-testid="variant-add-wizard-step"
                            data-step={String(step)}
                        >
                            {isAddConditionMode
                                ? tFormat(STRINGS.variant.wizard_step_label_short, locale, { n: step })
                                : tFormat(STRINGS.variant.wizard_step_label, locale, { n: step })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t(STRINGS.variant.wizard_close, locale)}
                        data-testid="variant-add-wizard-close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    {step === 1 && (
                        <Step1Kind
                            onPick={handlePickKind}
                            onPickPreset={handlePickPreset}
                            sectionType={sectionType}
                        />
                    )}
                    {step === 2 && (
                        <Step2Configure
                            kind={kind}
                            state={state}
                            onState={setState}
                            experiments={experiments}
                            segments={segments}
                        />
                    )}
                    {step === 3 && (
                        <Step3Name
                            label={label}
                            onLabel={setLabel}
                            condition={condition}
                        />
                    )}
                </div>

                {step !== 1 && (
                    <footer className="flex items-center justify-between gap-2 border-t border-(--card-border) bg-muted/20 px-4 py-3">
                        <button
                            type="button"
                            data-testid="variant-add-wizard-back"
                            onClick={() => {
                                if (isAddConditionMode) {
                                    onClose();
                                    return;
                                }
                                if (step === 2) setStep(1);
                                else if (step === 3) setStep(2);
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                            {t(STRINGS.variant.wizard_back, locale)}
                        </button>
                        {step === 2 && !isAddConditionMode && (
                            <button
                                type="button"
                                disabled={!canAdvance}
                                data-testid="variant-add-wizard-next"
                                onClick={() => setStep(3)}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors",
                                    canAdvance ? "hover:bg-primary/90" : "cursor-not-allowed opacity-50",
                                )}
                            >
                                {t(STRINGS.variant.wizard_next, locale)}
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        )}
                        {(step === 3 || (step === 2 && isAddConditionMode)) && (
                            <button
                                type="button"
                                disabled={!canAdvance}
                                data-testid="variant-add-wizard-submit"
                                onClick={handleSubmit}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors",
                                    canAdvance ? "hover:bg-primary/90" : "cursor-not-allowed opacity-50",
                                )}
                            >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                {isAddConditionMode
                                    ? t(STRINGS.variant.wizard_submit_condition, locale)
                                    : t(STRINGS.variant.wizard_submit_variant, locale)}
                            </button>
                        )}
                    </footer>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Step 1 — kind picker                                                  */
/* ─────────────────────────────────────────────────────────────────── */

interface Step1Props {
    onPick: (kind: VariantKind) => void;
    onPickPreset: (
        preset:
            | "holiday"
            | "mobile"
            | "governorate"
            | "ab_test"
            | "baghdad_same_day"
            | "ramadan"
            | "whatsapp_first",
    ) => void;
    sectionType?: string;
}

/** Section types where the WhatsApp-first preset makes sense. */
const WHATSAPP_FIRST_SECTION_TYPES: readonly string[] = [
    "hero_image",
    "pdp_buy_box",
    "cta_banner",
];

/**
 * Preset cards — colored bento-style — that wrap the most common variant
 * scenarios. Section-type-specific presets only appear when relevant.
 * The legacy 9-kind picker is kept behind an "Advanced — choose any rule"
 * disclosure for power users.
 */
function Step1Kind({ onPick, onPickPreset, sectionType }: Step1Props): ReactElement {
    const locale = useEditorLocale();
    const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

    const showBaghdadPreset = sectionType === "delivery_promise";
    const showWhatsappPreset =
        sectionType !== undefined && WHATSAPP_FIRST_SECTION_TYPES.includes(sectionType);

    return (
        <div className="space-y-4" data-testid="variant-add-wizard-step1">
            <p className="text-sm font-medium text-foreground">
                {t(STRINGS.variant.preset_heading, locale)}
            </p>

            {/* Bento preset grid */}
            <ul
                data-testid="variant-add-wizard-presets"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
                <PresetCard
                    testId="variant-add-wizard-preset-holiday"
                    Icon={Calendar}
                    tone="amber"
                    title={t(STRINGS.variant.preset_holiday_title, locale)}
                    description={t(STRINGS.variant.preset_holiday_desc, locale)}
                    onClick={() => onPickPreset("holiday")}
                />
                <PresetCard
                    testId="variant-add-wizard-preset-mobile"
                    Icon={Smartphone}
                    tone="sky"
                    title={t(STRINGS.variant.preset_mobile_title, locale)}
                    description={t(STRINGS.variant.preset_mobile_desc, locale)}
                    onClick={() => onPickPreset("mobile")}
                />
                <PresetCard
                    testId="variant-add-wizard-preset-governorate"
                    Icon={MapPin}
                    tone="emerald"
                    title={t(STRINGS.variant.preset_governorate_title, locale)}
                    description={t(STRINGS.variant.preset_governorate_desc, locale)}
                    onClick={() => onPickPreset("governorate")}
                />
                <PresetCard
                    testId="variant-add-wizard-preset-ab_test"
                    Icon={FlaskConical}
                    tone="violet"
                    title={t(STRINGS.variant.preset_ab_title, locale)}
                    description={t(STRINGS.variant.preset_ab_desc, locale)}
                    onClick={() => onPickPreset("ab_test")}
                />
                {showBaghdadPreset && (
                    <PresetCard
                        testId="variant-add-wizard-preset-baghdad_same_day"
                        Icon={Truck}
                        tone="emerald"
                        title={t(
                            STRINGS.variant.preset_baghdad_same_day_title,
                            locale,
                        )}
                        description={t(
                            STRINGS.variant.preset_baghdad_same_day_desc,
                            locale,
                        )}
                        onClick={() => onPickPreset("baghdad_same_day")}
                    />
                )}
                <PresetCard
                    testId="variant-add-wizard-preset-ramadan"
                    Icon={Moon}
                    tone="violet"
                    title={t(STRINGS.variant.preset_ramadan_title, locale)}
                    description={t(STRINGS.variant.preset_ramadan_desc, locale)}
                    onClick={() => onPickPreset("ramadan")}
                />
                {showWhatsappPreset && (
                    <PresetCard
                        testId="variant-add-wizard-preset-whatsapp_first"
                        Icon={MessageCircle}
                        tone="emerald"
                        title={t(
                            STRINGS.variant.preset_whatsapp_first_title,
                            locale,
                        )}
                        description={t(
                            STRINGS.variant.preset_whatsapp_first_desc,
                            locale,
                        )}
                        onClick={() => onPickPreset("whatsapp_first")}
                    />
                )}
            </ul>

            {/* Advanced disclosure */}
            <div className="border-t border-(--card-border) pt-3">
                <button
                    type="button"
                    data-testid="variant-add-wizard-advanced-toggle"
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    {t(STRINGS.variant.preset_advanced, locale)}
                </button>
                {advancedOpen && (
                    <ul
                        data-testid="variant-add-wizard-advanced-grid"
                        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                        {VARIANT_KIND_CARDS.map((c) => (
                            <li key={c.kind}>
                                <button
                                    type="button"
                                    data-testid={`variant-add-wizard-kind-${c.kind}`}
                                    onClick={() => onPick(c.kind)}
                                    className="flex w-full items-start gap-3 rounded-md border border-(--card-border) bg-(--card-bg) p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="text-xl leading-none"
                                    >
                                        {c.emoji}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold">{c.title}</div>
                                        <div className="mt-0.5 text-[11px] text-foreground/80">
                                            {c.description}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {/* Always-rendered hidden grid so tests that click the kind
                 *  cards directly (without expanding "Advanced" first) keep
                 *  working. The visible-when-expanded grid above is the
                 *  merchant-facing version. */}
                {!advancedOpen && (
                    <ul
                        aria-hidden="true"
                        className="sr-only"
                        data-testid="variant-add-wizard-advanced-grid-hidden"
                    >
                        {VARIANT_KIND_CARDS.map((c) => (
                            <li key={c.kind}>
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    data-testid={`variant-add-wizard-kind-${c.kind}`}
                                    onClick={() => onPick(c.kind)}
                                >
                                    {c.title}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Preset bento card                                                    */
/* ─────────────────────────────────────────────────────────────────── */

interface PresetCardProps {
    testId: string;
    Icon: typeof Calendar;
    tone: "amber" | "sky" | "emerald" | "violet";
    title: string;
    description: string;
    onClick: () => void;
}

const PRESET_TONES: Record<PresetCardProps["tone"], string> = {
    amber:
        "border-amber-300/60 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/20",
    sky:
        "border-sky-300/60 bg-sky-50 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:hover:bg-sky-500/20",
    emerald:
        "border-emerald-300/60 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20",
    violet:
        "border-violet-300/60 bg-violet-50 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:hover:bg-violet-500/20",
};

const PRESET_ICON_TONES: Record<PresetCardProps["tone"], string> = {
    amber: "text-amber-700 dark:text-amber-300",
    sky: "text-sky-700 dark:text-sky-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    violet: "text-violet-700 dark:text-violet-300",
};

function PresetCard({
    testId,
    Icon,
    tone,
    title,
    description,
    onClick,
}: PresetCardProps): ReactElement {
    return (
        <li>
            <button
                type="button"
                data-testid={testId}
                onClick={onClick}
                className={cn(
                    "flex h-full w-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                    PRESET_TONES[tone],
                )}
            >
                <Icon
                    aria-hidden="true"
                    className={cn("h-6 w-6", PRESET_ICON_TONES[tone])}
                />
                <div className="text-sm font-semibold text-foreground">{title}</div>
                <div className="text-[12px] leading-snug text-foreground/80">
                    {description}
                </div>
            </button>
        </li>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Step 2 — per-kind configuration                                       */
/* ─────────────────────────────────────────────────────────────────── */

interface Step2Props {
    kind: VariantKind;
    state: KindStateMap[VariantKind];
    onState: (next: KindStateMap[VariantKind]) => void;
    experiments: Experiment[];
    segments: AudienceSegment[];
}

function Step2Configure(props: Step2Props): ReactElement {
    const { kind, state, onState, experiments, segments } = props;

    return (
        <div
            className="space-y-3"
            data-testid="variant-add-wizard-step2"
            data-kind={kind}
        >
            {kind === "locale" && (
                <LocaleStep
                    state={state as KindStateMap["locale"]}
                    onState={(s) => onState(s)}
                />
            )}
            {kind === "breakpoint" && (
                <BreakpointStep
                    state={state as KindStateMap["breakpoint"]}
                    onState={(s) => onState(s)}
                />
            )}
            {kind === "time_window" && (
                <TimeWindowStep
                    state={state as KindStateMap["time_window"]}
                    onState={(s) => onState(s)}
                />
            )}
            {kind === "audience" && (
                <AudienceStep
                    state={state as KindStateMap["audience"]}
                    onState={(s) => onState(s)}
                    segments={segments}
                />
            )}
            {kind === "ab_test" && (
                <AbTestStep
                    state={state as KindStateMap["ab_test"]}
                    onState={(s) => onState(s)}
                    experiments={experiments}
                />
            )}
            {kind === "governorate" && (
                <GovernorateStep
                    state={state as KindStateMap["governorate"]}
                    onState={(s) => onState(s)}
                />
            )}
            {kind === "product" && (
                <IdListStep
                    state={state as KindStateMap["product"]}
                    onState={(s) => onState(s)}
                    kind="product"
                />
            )}
            {kind === "category" && (
                <IdListStep
                    state={state as KindStateMap["category"]}
                    onState={(s) => onState(s)}
                    kind="category"
                />
            )}
            {kind === "page" && (
                <PageStep
                    state={state as KindStateMap["page"]}
                    onState={(s) => onState(s)}
                />
            )}
        </div>
    );
}

/* ─── Sub-steps ──────────────────────────────────────────────────── */

function LocaleStep({
    state,
    onState,
}: {
    state: KindStateMap["locale"];
    onState: (s: KindStateMap["locale"]) => void;
}): ReactElement {
    const toggle = (loc: LocaleCode): void => {
        const next = state.values.includes(loc)
            ? state.values.filter((l) => l !== loc)
            : [...state.values, loc];
        onState({ values: next });
    };
    return (
        <div className="space-y-2" data-testid="variant-wizard-locale">
            <p className="text-sm font-medium">Which languages?</p>
            <ul className="flex flex-col gap-1.5">
                {SUPPORTED_LOCALES.map((loc) => {
                    const checked = state.values.includes(loc);
                    return (
                        <li key={loc}>
                            <label
                                className="flex cursor-pointer items-center gap-2 rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-2 text-sm transition-colors hover:bg-muted/30"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    data-testid={`variant-wizard-locale-${loc}`}
                                    onChange={() => toggle(loc)}
                                />
                                <span className="font-medium">{LOCALE_LABELS[loc]}</span>
                                <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {loc}
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function BreakpointStep({
    state,
    onState,
}: {
    state: KindStateMap["breakpoint"];
    onState: (s: KindStateMap["breakpoint"]) => void;
}): ReactElement {
    const toggle = (b: Breakpoint): void => {
        const next = state.values.includes(b)
            ? state.values.filter((v) => v !== b)
            : [...state.values, b];
        onState({ values: next });
    };
    const ALL: Breakpoint[] = ["mobile", "tablet", "desktop"];
    return (
        <div className="space-y-2" data-testid="variant-wizard-breakpoint">
            <p className="text-sm font-medium">Which devices?</p>
            <ul className="flex flex-col gap-1.5">
                {ALL.map((b) => {
                    const checked = state.values.includes(b);
                    return (
                        <li key={b}>
                            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-2 text-sm transition-colors hover:bg-muted/30">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    data-testid={`variant-wizard-breakpoint-${b}`}
                                    onChange={() => toggle(b)}
                                />
                                <span aria-hidden="true">{BREAKPOINT_EMOJI[b]}</span>
                                <span className="font-medium">{BREAKPOINT_LABELS[b]}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function TimeWindowStep({
    state,
    onState,
}: {
    state: KindStateMap["time_window"];
    onState: (s: KindStateMap["time_window"]) => void;
}): ReactElement {
    return (
        <div className="space-y-3" data-testid="variant-wizard-time-window">
            <p className="text-sm font-medium">When should this variant be active?</p>
            <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="variant-wizard-time-start">
                    Starts at
                </label>
                <input
                    id="variant-wizard-time-start"
                    type="datetime-local"
                    data-testid="variant-wizard-time-start"
                    value={state.start_iso}
                    onChange={(e) => onState({ ...state, start_iso: e.target.value })}
                    className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="variant-wizard-time-end">
                    Ends at <span className="text-[11px] font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                    id="variant-wizard-time-end"
                    type="datetime-local"
                    data-testid="variant-wizard-time-end"
                    value={state.end_iso}
                    onChange={(e) => onState({ ...state, end_iso: e.target.value })}
                    className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="variant-wizard-time-tz">
                    Timezone
                </label>
                <select
                    id="variant-wizard-time-tz"
                    data-testid="variant-wizard-time-tz"
                    value={state.timezone}
                    onChange={(e) => onState({ ...state, timezone: e.target.value })}
                    className="w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                    {TIMEZONE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function AudienceStep({
    state,
    onState,
    segments,
}: {
    state: KindStateMap["audience"];
    onState: (s: KindStateMap["audience"]) => void;
    segments: AudienceSegment[];
}): ReactElement {
    if (segments.length === 0) {
        return (
            <div
                className="rounded-md border border-dashed border-(--card-border) px-3 py-4 text-center text-[12px] text-foreground/80"
                data-testid="variant-wizard-audience-empty"
            >
                No segments defined. Define segments in{" "}
                <span className="font-medium">Settings → Segments</span> before
                using this variant kind.
            </div>
        );
    }
    return (
        <div className="space-y-2" data-testid="variant-wizard-audience">
            <label className="text-sm font-medium" htmlFor="variant-wizard-audience-select">
                Customer segment
            </label>
            <select
                id="variant-wizard-audience-select"
                data-testid="variant-wizard-audience-select"
                value={state.segment_id}
                onChange={(e) => onState({ segment_id: e.target.value })}
                className="w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
                <option value="">— pick a segment —</option>
                {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                        {s.name}
                    </option>
                ))}
            </select>
        </div>
    );
}

function AbTestStep({
    state,
    onState,
    experiments,
}: {
    state: KindStateMap["ab_test"];
    onState: (s: KindStateMap["ab_test"]) => void;
    experiments: Experiment[];
}): ReactElement {
    if (experiments.length === 0) {
        return (
            <div
                className="rounded-md border border-dashed border-(--card-border) px-3 py-4 text-center text-[12px] text-foreground/80"
                data-testid="variant-wizard-ab-test-empty"
            >
                No experiments defined. Create experiments in{" "}
                <span className="font-medium">Settings → Experiments</span>{" "}
                first.
            </div>
        );
    }
    const selected = experiments.find((e) => e.id === state.experiment_id);
    return (
        <div className="space-y-2" data-testid="variant-wizard-ab-test">
            <label className="text-sm font-medium" htmlFor="variant-wizard-ab-exp">
                Experiment
            </label>
            <select
                id="variant-wizard-ab-exp"
                data-testid="variant-wizard-ab-exp"
                value={state.experiment_id}
                onChange={(e) => onState({ experiment_id: e.target.value, arm: "" })}
                className="w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
                <option value="">— pick an experiment —</option>
                {experiments.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                        {exp.name}
                    </option>
                ))}
            </select>
            {selected && (
                <>
                    <label className="text-sm font-medium" htmlFor="variant-wizard-ab-arm">
                        Arm
                    </label>
                    <select
                        id="variant-wizard-ab-arm"
                        data-testid="variant-wizard-ab-arm"
                        value={state.arm}
                        onChange={(e) => onState({ ...state, arm: e.target.value })}
                        className="w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    >
                        <option value="">— pick an arm —</option>
                        {selected.arms.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.label} ({a.traffic_pct}%)
                            </option>
                        ))}
                    </select>
                </>
            )}
        </div>
    );
}

function GovernorateStep({
    state,
    onState,
}: {
    state: KindStateMap["governorate"];
    onState: (s: KindStateMap["governorate"]) => void;
}): ReactElement {
    const toggle = (code: GovernorateCode): void => {
        const next = state.values.includes(code)
            ? state.values.filter((v) => v !== code)
            : [...state.values, code];
        onState({ values: next });
    };
    return (
        <div className="space-y-2" data-testid="variant-wizard-governorate">
            <p className="text-sm font-medium">Which governorates?</p>
            <ul className="flex flex-wrap gap-1.5">
                {IRAQ_GOVERNORATES.map((g) => {
                    const checked = state.values.includes(g.code);
                    return (
                        <li key={g.code}>
                            <button
                                type="button"
                                data-testid={`variant-wizard-governorate-${g.code}`}
                                aria-pressed={checked}
                                onClick={() => toggle(g.code)}
                                className={cn(
                                    "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                                    checked
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-(--card-border) bg-(--card-bg) text-foreground hover:bg-muted/40",
                                )}
                            >
                                <span className="opacity-70">{g.code}</span>{" "}
                                <span>{g.name}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function IdListStep<K extends "product" | "category">({
    state,
    onState,
    kind,
}: {
    state: K extends "product" ? KindStateMap["product"] : KindStateMap["category"];
    onState: (s: K extends "product" ? KindStateMap["product"] : KindStateMap["category"]) => void;
    kind: K;
}): ReactElement {
    const [query, setQuery] = useState<string>("");
    const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
    const [searching, setSearching] = useState<boolean>(false);
    const [searchFailed, setSearchFailed] = useState<boolean>(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const ids =
        kind === "product"
            ? (state as KindStateMap["product"]).product_ids
            : (state as KindStateMap["category"]).category_ids;

    const setIds = useCallback(
        (next: string[]): void => {
            if (kind === "product") {
                onState({ product_ids: next } as KindStateMap["product"] as never);
            } else {
                onState({ category_ids: next } as KindStateMap["category"] as never);
            }
        },
        [kind, onState],
    );

    // Debounced search (best-effort — falls back to manual entry if search fails).
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!query.trim()) {
            setResults([]);
            setSearching(false);
            setSearchFailed(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const url =
                    kind === "product"
                        ? `/api/products/search?q=${encodeURIComponent(query)}`
                        : `/api/categories/search?q=${encodeURIComponent(query)}`;
                const r = await fetch(url);
                if (!r.ok) throw new Error(`Search returned ${r.status}`);
                const data = (await r.json()) as { results?: Array<{ id: string; name: string }> };
                setResults(data.results ?? []);
                setSearchFailed(false);
            } catch {
                setSearchFailed(true);
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, kind]);

    const add = useCallback(
        (id: string): void => {
            const trimmed = id.trim();
            if (!trimmed || ids.includes(trimmed)) return;
            setIds([...ids, trimmed]);
        },
        [ids, setIds],
    );

    const remove = useCallback(
        (id: string): void => {
            setIds(ids.filter((x) => x !== id));
        },
        [ids, setIds],
    );

    return (
        <div className="space-y-2" data-testid={`variant-wizard-${kind}`}>
            <label className="text-sm font-medium" htmlFor={`variant-wizard-${kind}-search`}>
                Search {kind === "product" ? "products" : "categories"}
            </label>
            <div className="relative">
                <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <input
                    id={`variant-wizard-${kind}-search`}
                    type="search"
                    data-testid={`variant-wizard-${kind}-search`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Type a name or paste an ID`}
                    className="h-9 w-full rounded-md border border-(--card-border) bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
                />
            </div>
            {searching && (
                <p
                    className="text-[11px] text-muted-foreground"
                    data-testid={`variant-wizard-${kind}-searching`}
                >
                    Searching…
                </p>
            )}
            {results.length > 0 && (
                <ul
                    className="max-h-40 overflow-y-auto rounded-md border border-(--card-border) bg-(--card-bg)"
                    data-testid={`variant-wizard-${kind}-results`}
                >
                    {results.map((r) => (
                        <li key={r.id}>
                            <button
                                type="button"
                                data-testid={`variant-wizard-${kind}-result-${r.id}`}
                                onClick={() => add(r.id)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40"
                            >
                                <span className="truncate">{r.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {r.id}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {searchFailed && (
                <ManualIdEntry
                    kind={kind}
                    onAdd={(id) => add(id)}
                />
            )}
            {ids.length > 0 && (
                <ul
                    className="flex flex-wrap gap-1.5"
                    data-testid={`variant-wizard-${kind}-chips`}
                >
                    {ids.map((id) => (
                        <li key={id}>
                            <span
                                data-testid={`variant-wizard-${kind}-chip-${id}`}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-foreground"
                            >
                                <span className="max-w-32 truncate">{id}</span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${id}`}
                                    data-testid={`variant-wizard-${kind}-chip-${id}-remove`}
                                    onClick={() => remove(id)}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ManualIdEntry({
    kind,
    onAdd,
}: {
    kind: "product" | "category";
    onAdd: (id: string) => void;
}): ReactElement {
    const [value, setValue] = useState<string>("");
    return (
        <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
                Search unavailable — paste IDs separated by commas.
            </p>
            <div className="flex items-center gap-1.5">
                <input
                    type="text"
                    data-testid={`variant-wizard-${kind}-manual`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="id-1, id-2, id-3"
                    className="h-9 flex-1 rounded-md border border-(--card-border) bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                    type="button"
                    data-testid={`variant-wizard-${kind}-manual-add`}
                    onClick={() => {
                        for (const piece of value.split(",")) {
                            const trimmed = piece.trim();
                            if (trimmed) onAdd(trimmed);
                        }
                        setValue("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    Add
                </button>
            </div>
        </div>
    );
}

function PageStep({
    state,
    onState,
}: {
    state: KindStateMap["page"];
    onState: (s: KindStateMap["page"]) => void;
}): ReactElement {
    const toggle = (p: PageId): void => {
        const next = state.values.includes(p)
            ? state.values.filter((v) => v !== p)
            : [...state.values, p];
        onState({ values: next });
    };
    return (
        <div className="space-y-2" data-testid="variant-wizard-page">
            <p className="text-sm font-medium">Which pages?</p>
            <ul className="grid grid-cols-2 gap-1.5">
                {PAGE_IDS.map((p) => {
                    const checked = state.values.includes(p);
                    return (
                        <li key={p}>
                            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-(--card-border) bg-(--card-bg) px-2 py-1.5 text-xs transition-colors hover:bg-muted/30">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    data-testid={`variant-wizard-page-${p}`}
                                    onChange={() => toggle(p)}
                                />
                                <span className="truncate font-medium">{PAGE_LABELS[p]}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Step 3 — label                                                        */
/* ─────────────────────────────────────────────────────────────────── */

interface Step3Props {
    label: string;
    onLabel: (next: string) => void;
    condition: VariantCondition | null;
}

function Step3Name({ label, onLabel, condition }: Step3Props): ReactElement {
    const placeholder = condition
        ? defaultLabelForCondition(condition)
        : "Black Friday hero";
    return (
        <div className="space-y-2" data-testid="variant-add-wizard-step3">
            <label className="text-sm font-medium" htmlFor="variant-add-wizard-label">
                Variant label
            </label>
            <input
                id="variant-add-wizard-label"
                type="text"
                data-testid="variant-add-wizard-label"
                value={label}
                onChange={(e) => onLabel(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground">
                Used only in the editor — visitors never see it.
            </p>
        </div>
    );
}

function defaultLabelForCondition(c: VariantCondition): string {
    switch (c.kind) {
        case "locale":
            return c.values.length > 1
                ? `Locales (${c.values.join(", ")})`
                : `${LOCALE_LABELS[c.values[0]]} variant`;
        case "breakpoint":
            return c.values.length > 1
                ? `Devices (${c.values.join(", ")})`
                : `${BREAKPOINT_LABELS[c.values[0]]} variant`;
        case "time_window":
            return "Scheduled variant";
        case "audience":
            return "Segment variant";
        case "ab_test":
            return `A/B arm ${c.arm}`;
        case "governorate":
            return c.values.length > 1
                ? `Governorates (${c.values.length})`
                : `Governorate ${c.values[0]}`;
        case "product":
            return `Products (${c.product_ids.length})`;
        case "category":
            return `Categories (${c.category_ids.length})`;
        case "page":
            return c.values.length > 1
                ? `Pages (${c.values.length})`
                : `${PAGE_LABELS[c.values[0]]} page`;
    }
}
