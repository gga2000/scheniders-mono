"use client";

// =====================================================================
// OnboardingWizard — store-creation
// =====================================================================
// Post-signup guided setup so a first-time merchant lands in the editor
// on a real, branded store instead of 16 empty pages.
//
// Steps:
//   1. What you sell — picks a vertical, which recommends a template.
//   2. Pick a starter template (recommended one highlighted).
//   3. Business basics — name, WhatsApp, brand colour.
//   → "Create my store" seeds `store_config_v2_draft` and opens the editor.
// =====================================================================

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    Baby,
    BookOpen,
    Car,
    Check,
    Dumbbell,
    Gem,
    Heart,
    ImagePlus,
    Loader2,
    LayoutTemplate,
    Package,
    Shirt,
    ShoppingBasket,
    Smartphone,
    Sofa,
    Sparkles,
    Store,
    UtensilsCrossed,
    X,
    type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveContentPack } from "@/lib/store-templates/content-packs";
import type { StoreCopy } from "@/lib/store-copy";
import {
    buildStarterStoreConfigV2,
    STARTER_TEMPLATES,
    starterTaxonomy,
    type WizardIndustry,
} from "@/lib/starter-store";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface OnboardingWizardProps {
    tenantId: string;
    defaultBusinessName: string;
    defaultWhatsapp?: string;
    industries: WizardIndustry[];
}

/** Curated brand-colour presets — covers the common storefront palettes. */
const COLOR_PRESETS: { label: string; hex: string }[] = [
    { label: "Midnight", hex: "#1e1e1e" },
    { label: "Royal", hex: "#4f46e5" },
    { label: "Ocean", hex: "#0ea5e9" },
    { label: "Emerald", hex: "#10b981" },
    { label: "Sunset", hex: "#f97316" },
    { label: "Rose", hex: "#e11d48" },
];

/* ── Contrast guard ─────────────────────────────────────────────────
 * The chosen colour becomes the storefront's primary button surface.
 * The brand-kit emitter picks white text when luminance < 0.5, else
 * ink (#1a1a1a) — mirror that here and warn (with a one-tap fix) when
 * the resulting pair falls below WCAG AA (4.5:1), instead of letting a
 * first-time merchant ship unreadable buttons without knowing.
 */

function hexToRgb(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relLuminance([r, g, b]: [number, number, number]): number {
    const lin = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
    const ra = hexToRgb(a);
    const rb = hexToRgb(b);
    if (!ra || !rb) return 21;
    const la = relLuminance(ra);
    const lb = relLuminance(rb);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of the button pair the emitter will actually produce. */
function buttonContrast(hex: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 21;
    const fg = relLuminance(rgb) < 0.5 ? "#ffffff" : "#1a1a1a";
    return contrastRatio(hex, fg);
}

/** Nudge the colour darker/lighter (keeping hue) until the pair passes AA. */
function suggestReadableShade(hex: string): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    // Mid-luminance colours fail both ways; darkening preserves the
    // "white text on brand colour" look merchants expect from buttons.
    let [r, g, b] = rgb;
    for (let i = 0; i < 20; i++) {
        const candidate = `#${[r, g, b]
            .map((c) => Math.round(c).toString(16).padStart(2, "0"))
            .join("")}`;
        if (buttonContrast(candidate) >= 4.5) return candidate;
        r *= 0.88;
        g *= 0.88;
        b *= 0.88;
    }
    return "#1e1e1e";
}

/**
 * Lucide icon registry keyed on the icon name stored in the `industries` DB
 * table. Covers all 13 seeded rows plus common extras for newly-added rows.
 */
const ICON_REGISTRY: Record<string, LucideIcon> = {
    Baby,
    BookOpen,
    Car,
    Dumbbell,
    Gem,
    Heart,
    Package,
    Shirt,
    ShoppingBasket,
    Smartphone,
    Sofa,
    Sparkles,
    Store,
    UtensilsCrossed,
};

type Step = 0 | 1 | 2;

/** Parse a money input to a positive integer, or undefined when blank/invalid. */
function parsePositiveInt(value: string): number | undefined {
    const n = Number(value.replace(/[,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export function OnboardingWizard({
    tenantId,
    defaultBusinessName,
    defaultWhatsapp,
    industries,
}: OnboardingWizardProps) {
    const router = useRouter();
    const { t, language } = useLanguage();
    const isAr = language === "ar";

    const [step, setStep] = useState<Step>(0);
    const [vertical, setVertical] = useState<string | null>(null);
    // Tracks the recommended template from the chosen industry (shown as badge).
    const [recommendedId, setRecommendedId] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState<string>(
        STARTER_TEMPLATES[0]?.id ?? "",
    );
    const [businessName, setBusinessName] = useState(defaultBusinessName);
    const [whatsapp, setWhatsapp] = useState(defaultWhatsapp ?? "");
    const [brandColor, setBrandColor] = useState<string>(COLOR_PRESETS[0].hex);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [deliveryFee, setDeliveryFee] = useState("");
    const [freeThreshold, setFreeThreshold] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // What the merchant sells, in their own words, and the copy written from
    // it. Both optional: skip the box and the store gets the niche pack's
    // words, which is exactly what shipped before this existed.
    const [sells, setSells] = useState("");
    const [copy, setCopy] = useState<StoreCopy | null>(null);

    const basicsValid = businessName.trim().length > 0;
    const canCreate = basicsValid && templateId.length > 0;

    const handlePickVertical = (industry: WizardIndustry) => {
        const rec =
            industry.recommended_template_id ?? STARTER_TEMPLATES[0]?.id ?? "";
        setVertical(industry.id);
        setRecommendedId(rec);
        setTemplateId(rec);
        setStep(1);
    };

    const handleCreate = async () => {
        if (!canCreate || submitting) return;
        setSubmitting(true);
        setError(null);

        // Industry rows come from the DB with uuid ids — the copy-pack
        // resolver matches on the NAME (works for slug fallbacks too).
        const industryName = vertical
            ? industries.find((i) => i.id === vertical)?.name ?? vertical
            : undefined;
        // Niche → content pack: the words, the starter categories and the
        // attributes; the template is only the look.
        const pack = resolveContentPack(industryName);
        const taxonomy = starterTaxonomy(pack.id);
        const config = buildStarterStoreConfigV2({
            templateId,
            packId: pack.id,
            ...(copy ? { copy } : {}),
            industryId: industryName,
            businessName: businessName.trim(),
            brandColor,
            logoUrl: logoUrl ?? undefined,
            whatsappNumber: whatsapp.trim() || undefined,
            deliveryFeeIqd: parsePositiveInt(deliveryFee),
            freeDeliveryThresholdIqd: parsePositiveInt(freeThreshold),
        });

        try {
            const res = await fetch("/api/store-config-v2/seed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenant_id: tenantId,
                    config,
                    categories: taxonomy.categories,
                    attribute_defs: taxonomy.attribute_defs,
                }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                    error?: string;
                };
                setError(data.error || t("wizard.error.create"));
                setSubmitting(false);
                return;
            }
            router.push("/store/edit?welcome=1");
        } catch {
            setError(t("wizard.error.network"));
            setSubmitting(false);
        }
    };

    return (
        <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
            {/* Header */}
            <div className="mb-8 text-center">
                <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
                    <Store className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {t("wizard.title")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t("wizard.subtitle")}
                </p>
            </div>

            <StepHeader step={step} isAr={isAr} t={t} />

            <div className="rounded-2xl border border-border bg-(--card-bg) p-6 shadow-(--card-shadow)">
                {step === 0 ? (
                    <IntentStep
                        industries={industries}
                        selected={vertical}
                        onSelect={handlePickVertical}
                        isAr={isAr}
                        t={t}
                    />
                ) : step === 1 ? (
                    <TemplateStep
                        templateId={templateId}
                        recommendedId={recommendedId}
                        onSelect={setTemplateId}
                        isAr={isAr}
                        t={t}
                    />
                ) : (
                    <BasicsStep
                        tenantId={tenantId}
                        businessName={businessName}
                        onBusinessName={setBusinessName}
                        logoUrl={logoUrl}
                        onLogoUrl={setLogoUrl}
                        whatsapp={whatsapp}
                        onWhatsapp={setWhatsapp}
                        brandColor={brandColor}
                        onBrandColor={setBrandColor}
                        deliveryFee={deliveryFee}
                        onDeliveryFee={setDeliveryFee}
                        freeThreshold={freeThreshold}
                        onFreeThreshold={setFreeThreshold}
                        sells={sells}
                        onSells={(v) => {
                            setSells(v);
                            // Editing the description invalidates copy written
                            // from the old one — never seed a stale answer.
                            setCopy(null);
                        }}
                        copy={copy}
                        onCopy={setCopy}
                        packId={resolveContentPack(
                            vertical ? (industries.find((i) => i.id === vertical)?.name ?? vertical) : undefined,
                        ).id}
                        t={t}
                    />
                )}

                {error && (
                    <p
                        role="alert"
                        className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                    >
                        {error}
                    </p>
                )}

                {/* Footer nav (step 0 advances on selection → no Continue) */}
                {step > 0 && (
                    <div className="mt-6 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setStep((s) => (s - 1) as Step)}
                            disabled={submitting}
                            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                            {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                            {t("wizard.nav.back")}
                        </button>

                        {step === 1 ? (
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={!templateId}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover) disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {t("wizard.nav.continue")}
                                {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={!canCreate || submitting}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover) disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t("wizard.nav.creating")}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        {t("wizard.nav.create")}
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
                {t("wizard.footer")}
            </p>
        </div>
    );
}

type TFn = (key: string, fallbackOrVars?: string | Record<string, string | number>, vars?: Record<string, string | number>) => string;

function StepHeader({ step, isAr, t }: { step: Step; isAr: boolean; t: TFn }) {
    const steps = [t("wizard.step.industry"), t("wizard.step.template"), t("wizard.step.basics")];
    return (
        <ol className="mb-5 flex items-center justify-center gap-3">
            {steps.map((label, i) => {
                const active = i === step;
                const done = i < step;
                return (
                    <li key={label} className="flex items-center gap-2">
                        <span
                            className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                                active
                                    ? "bg-foreground text-background"
                                    : done
                                      ? "bg-emerald-500 text-white"
                                      : "bg-muted text-muted-foreground",
                            )}
                        >
                            {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        <span
                            className={cn(
                                "hidden text-xs font-medium sm:inline",
                                active ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {label}
                        </span>
                        {i < steps.length - 1 && (
                            <span className="mx-1 text-muted-foreground/50">{isAr ? "←" : "→"}</span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

function IntentStep({
    industries,
    selected,
    onSelect,
    isAr,
    t,
}: {
    industries: WizardIndustry[];
    selected: string | null;
    onSelect: (industry: WizardIndustry) => void;
    isAr: boolean;
    t: TFn;
}) {
    return (
        <div>
            <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">
                    {t("wizard.intent.heading")}
                </h2>
                <p className="text-xs text-muted-foreground">
                    {t("wizard.intent.subtitle")}
                </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {industries.map((industry) => {
                    const Icon =
                        (industry.icon ? ICON_REGISTRY[industry.icon] : null) ?? Store;
                    const active = industry.id === selected;
                    const label = isAr ? (industry.name_ar ?? industry.name) : industry.name;
                    const color = industry.color ?? "#6B7280";
                    return (
                        <li key={industry.id}>
                            <button
                                type="button"
                                aria-pressed={active}
                                onClick={() => onSelect(industry)}
                                className={cn(
                                    "flex h-full w-full flex-col items-start gap-2 rounded-xl border bg-(--card-bg) p-3.5 text-start transition-all duration-150",
                                    active
                                        ? "border-foreground ring-1 ring-foreground"
                                        : "border-border shadow-(--card-shadow) hover:-translate-y-0.5 hover:border-(--border-hover)",
                                )}
                            >
                                <span
                                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                                    style={{ backgroundColor: `${color}18`, color }}
                                >
                                    <Icon className="h-4.5 w-4.5" />
                                </span>
                                <span className="text-sm font-semibold text-foreground">
                                    {label}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
                {label}
            </label>
            {children}
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

function BasicsStep({
    tenantId,
    businessName,
    onBusinessName,
    logoUrl,
    onLogoUrl,
    whatsapp,
    onWhatsapp,
    brandColor,
    onBrandColor,
    deliveryFee,
    onDeliveryFee,
    freeThreshold,
    onFreeThreshold,
    sells,
    onSells,
    copy,
    onCopy,
    packId,
    t,
}: {
    tenantId: string;
    businessName: string;
    onBusinessName: (v: string) => void;
    logoUrl: string | null;
    onLogoUrl: (v: string | null) => void;
    whatsapp: string;
    onWhatsapp: (v: string) => void;
    brandColor: string;
    onBrandColor: (v: string) => void;
    deliveryFee: string;
    onDeliveryFee: (v: string) => void;
    freeThreshold: string;
    onFreeThreshold: (v: string) => void;
    sells: string;
    onSells: (v: string) => void;
    copy: StoreCopy | null;
    onCopy: (c: StoreCopy | null) => void;
    packId: string;
    t: TFn;
}) {
    const inputCls =
        "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none";

    return (
        <div className="space-y-5">
            <Field label={t("wizard.basics.businessName")}>
                <input
                    type="text"
                    value={businessName}
                    onChange={(e) => onBusinessName(e.target.value)}
                    placeholder={t("wizard.basics.businessNamePlaceholder")}
                    className={inputCls}
                />
            </Field>

            <StoreCopyField
                businessName={businessName}
                packId={packId}
                sells={sells}
                onSells={onSells}
                copy={copy}
                onCopy={onCopy}
                inputCls={inputCls}
                t={t}
            />

            <Field label={t("wizard.basics.logo")} hint={t("wizard.basics.logoHint")}>
                <LogoField
                    tenantId={tenantId}
                    logoUrl={logoUrl}
                    onChange={onLogoUrl}
                    t={t}
                />
            </Field>

            <Field
                label={t("wizard.basics.whatsapp")}
                hint={t("wizard.basics.whatsappHint")}
            >
                <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => onWhatsapp(e.target.value)}
                    placeholder="07XXXXXXXX"
                    className={inputCls}
                />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                    label={t("wizard.basics.deliveryFee")}
                    hint={t("wizard.basics.deliveryFeeHint")}
                >
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={deliveryFee}
                        onChange={(e) => onDeliveryFee(e.target.value)}
                        placeholder="5000"
                        className={inputCls}
                    />
                </Field>
                <Field
                    label={t("wizard.basics.freeDelivery")}
                    hint={t("wizard.basics.freeDeliveryHint")}
                >
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={freeThreshold}
                        onChange={(e) => onFreeThreshold(e.target.value)}
                        placeholder="50000"
                        className={inputCls}
                    />
                </Field>
            </div>

            <Field label={t("wizard.basics.brandColor")} hint={t("wizard.basics.brandColorHint")}>
                <div className="flex flex-wrap items-center gap-2.5">
                    {COLOR_PRESETS.map((c) => {
                        const selected = c.hex === brandColor;
                        return (
                            <button
                                key={c.hex}
                                type="button"
                                aria-label={c.label}
                                aria-pressed={selected}
                                onClick={() => onBrandColor(c.hex)}
                                className={cn(
                                    "h-9 w-9 rounded-full ring-offset-2 ring-offset-(--card-bg) transition-all",
                                    selected
                                        ? "ring-2 ring-foreground"
                                        : "ring-1 ring-border hover:scale-105",
                                )}
                                style={{ backgroundColor: c.hex }}
                            >
                                {selected && (
                                    <Check className="mx-auto h-4 w-4 text-white" />
                                )}
                            </button>
                        );
                    })}
                    <label className="ml-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                            type="color"
                            value={brandColor}
                            onChange={(e) => onBrandColor(e.target.value)}
                            className="h-9 w-9 cursor-pointer rounded-lg border border-border bg-background p-0.5"
                            aria-label={t("wizard.basics.colorCustom")}
                        />
                        {t("wizard.basics.colorCustom")}
                    </label>
                </div>
                {buttonContrast(brandColor) < 4.5 && (
                    <div
                        data-testid="wizard-contrast-warn"
                        className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    >
                        <span>{t("wizard.basics.contrastWarn")}</span>
                        <button
                            type="button"
                            data-testid="wizard-contrast-fix"
                            onClick={() => onBrandColor(suggestReadableShade(brandColor))}
                            className="inline-flex h-6 items-center gap-1.5 rounded-md border border-amber-400/60 bg-white px-2 font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                        >
                            <span
                                aria-hidden="true"
                                className="h-3 w-3 rounded-full border border-black/10"
                                style={{ backgroundColor: suggestReadableShade(brandColor) }}
                            />
                            {t("wizard.basics.contrastFix")}
                        </button>
                    </div>
                )}
            </Field>
        </div>
    );
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function LogoField({
    tenantId,
    logoUrl,
    onChange,
    t,
}: {
    tenantId: string;
    logoUrl: string | null;
    onChange: (url: string | null) => void;
    t: TFn;
}) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (!file) return;
            setError(null);
            if (file.size > LOGO_MAX_BYTES) {
                setError(t("wizard.logo.errorSize"));
                return;
            }
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";
            // Mirrors the brand-kit uploader: a tenant-scoped, unique path in
            // `tenant-assets`. The timestamp keeps every upload a fresh INSERT
            // (the bucket policy is insert-only — an overwrite 400s).
            const path = `${tenantId}/onboarding-logo-${Date.now()}.${ext}`;
            setUploading(true);
            try {
                const { error: upErr } = await supabase.storage
                    .from("tenant-assets")
                    .upload(path, file, { upsert: true });
                if (upErr) throw upErr;
                const {
                    data: { publicUrl },
                } = supabase.storage.from("tenant-assets").getPublicUrl(path);
                onChange(publicUrl);
            } catch {
                setError(t("wizard.logo.errorUpload"));
            } finally {
                setUploading(false);
            }
        },
        [tenantId, onChange, t],
    );

    return (
        <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                {logoUrl ? (
                    <Image
                        src={logoUrl}
                        alt={t("wizard.logo.alt")}
                        width={64}
                        height={64}
                        unoptimized
                        className="h-full w-full object-contain"
                    />
                ) : (
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <label
                        className={cn(
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50",
                            uploading && "pointer-events-none opacity-60",
                        )}
                    >
                        {uploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <ImagePlus className="h-3.5 w-3.5" />
                        )}
                        {uploading
                            ? t("wizard.logo.uploading")
                            : logoUrl
                              ? t("wizard.logo.replace")
                              : t("wizard.logo.upload")}
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleUpload}
                            className="hidden"
                        />
                    </label>
                    {logoUrl && !uploading && (
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                            {t("wizard.logo.remove")}
                        </button>
                    )}
                </div>
                {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
        </div>
    );
}

function TemplateStep({
    templateId,
    recommendedId,
    onSelect,
    isAr,
    t,
}: {
    templateId: string;
    recommendedId: string | null;
    onSelect: (id: string) => void;
    isAr: boolean;
    t: TFn;
}) {
    // Recommended template first.
    const templates = useMemo(() => {
        const list = [...STARTER_TEMPLATES];
        if (recommendedId) {
            list.sort((a, b) =>
                a.id === recommendedId ? -1 : b.id === recommendedId ? 1 : 0,
            );
        }
        return list;
    }, [recommendedId]);

    return (
        <div>
            <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <LayoutTemplate className="h-4 w-4" />
                </span>
                <div>
                    <h2 className="text-sm font-semibold text-foreground">
                        {t("wizard.template.heading")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {t("wizard.template.subtitle")}
                    </p>
                </div>
            </div>

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {templates.map((tpl) => {
                    const selected = tpl.id === templateId;
                    const recommended = tpl.id === recommendedId;
                    const name = isAr
                        ? (tpl.name_i18n.ar ?? tpl.name_i18n.en ?? tpl.id)
                        : (tpl.name_i18n.en ?? tpl.id);
                    const desc = isAr
                        ? (tpl.description_i18n.ar ?? tpl.description_i18n.en ?? "")
                        : (tpl.description_i18n.en ?? "");
                    return (
                        <li key={tpl.id}>
                            <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onSelect(tpl.id)}
                                className={cn(
                                    "flex w-full flex-col gap-2 rounded-xl border bg-(--card-bg) p-3 text-start transition-all duration-150",
                                    selected
                                        ? "border-foreground shadow-(--card-shadow-hover) ring-1 ring-foreground"
                                        : "border-border shadow-(--card-shadow) hover:-translate-y-0.5 hover:border-(--border-hover)",
                                )}
                            >
                                <TemplateThumbnail
                                    sections={tpl.pages.home ?? []}
                                    selected={selected}
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-foreground">
                                        {name}
                                    </span>
                                    {recommended ? (
                                        <span className="inline-flex h-5 items-center rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                            {t("wizard.template.recommended")}
                                        </span>
                                    ) : (
                                        <span className="inline-flex h-5 items-center rounded-full bg-muted/60 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
                                            {t("wizard.template.sections", {
                                                count: (tpl.pages.home ?? []).length,
                                            })}
                                        </span>
                                    )}
                                </div>
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {desc}
                                </p>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* Candy palette literals — the storefront's decorative tokens, used to
   make each template preview read like a real (miniature) page instead
   of grey placeholder bars (UX-20 / [E5]). */
const PREVIEW_CANDY = {
    pink: "#ff5a8a",
    mint: "#7cf0bd",
    butter: "#ffd84a",
    lilac: "#c5b6ff",
    sky: "#9ad8ff",
    cream: "#fff7ed",
    ink: "#1a1a1a",
} as const;

/** One miniature block per section type — stylized, not literal. */
function PreviewBlock({ type }: { type: string }): React.ReactElement {
    const c = PREVIEW_CANDY;
    if (type.startsWith("hero")) {
        return (
            <div
                className="flex flex-col justify-center gap-1 rounded-md px-2 py-2"
                style={{ background: `linear-gradient(120deg, ${c.butter}, ${c.pink}55)` }}
            >
                <span className="h-1.5 w-3/5 rounded-full" style={{ backgroundColor: c.ink }} />
                <span className="h-1 w-2/5 rounded-full" style={{ backgroundColor: `${c.ink}55` }} />
                <span
                    className="mt-0.5 h-2 w-1/3 rounded-full border"
                    style={{ backgroundColor: c.mint, borderColor: c.ink }}
                />
            </div>
        );
    }
    if (type === "promo_banner" || type === "sticky_cta_bar") {
        return <div className="h-1.5 rounded-full" style={{ backgroundColor: c.pink }} />;
    }
    if (type.includes("grid") || type === "image_gallery") {
        return (
            <div className="grid grid-cols-4 gap-0.5">
                {[c.mint, c.lilac, c.butter, c.sky].map((bg, i) => (
                    <span key={i} className="h-3 rounded-sm border border-black/15" style={{ backgroundColor: bg }} />
                ))}
            </div>
        );
    }
    if (type === "testimonials_carousel" || type === "press_quotes") {
        return (
            <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2.5 flex-1 rounded-sm border border-black/10" style={{ backgroundColor: c.cream }} />
                ))}
            </div>
        );
    }
    if (type === "countdown_card") {
        return (
            <div className="flex items-center justify-center gap-0.5 rounded-md py-1" style={{ backgroundColor: c.lilac }}>
                {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-2 rounded-sm" style={{ backgroundColor: c.ink }} />
                ))}
            </div>
        );
    }
    if (type === "trust_strip" || type === "cod_card" || type === "delivery_promise") {
        return (
            <div className="flex gap-0.5">
                {[c.mint, c.butter, c.sky].map((bg, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full border border-black/15" style={{ backgroundColor: bg }} />
                ))}
            </div>
        );
    }
    if (type.startsWith("newsletter")) {
        return (
            <div className="flex gap-0.5">
                <span className="h-2 flex-1 rounded-sm border border-black/15 bg-white" />
                <span className="h-2 w-1/4 rounded-sm" style={{ backgroundColor: c.pink }} />
            </div>
        );
    }
    // Text-ish fallback (brand_story, about, founder, policy…)
    return (
        <div className="flex flex-col gap-0.5">
            <span className="h-1 w-4/5 rounded-full bg-black/25" />
            <span className="h-1 w-3/5 rounded-full bg-black/15" />
        </div>
    );
}

function TemplateThumbnail({
    sections,
    selected,
}: {
    sections: Array<{ type: string }>;
    selected: boolean;
}) {
    const visible = sections.slice(0, 5);
    return (
        <div
            aria-hidden="true"
            className={cn(
                "flex aspect-video w-full flex-col justify-start gap-1 overflow-hidden rounded-lg border px-2 py-2 transition-colors",
                selected ? "border-foreground/40" : "border-black/10",
            )}
            style={{ backgroundColor: PREVIEW_CANDY.cream }}
        >
            {visible.map((s, i) => (
                <div key={i} className={cn(i === 0 && s.type.startsWith("hero") && "flex-1")}>
                    <PreviewBlock type={s.type} />
                </div>
            ))}
        </div>
    );
}

/**
 * "In a sentence, what do you sell?" — and the copy written from it.
 *
 * Optional by design: skipping it leaves the niche pack's words in place.
 * The merchant sees the headline and story before creating the store, so
 * nothing is seeded sight-unseen, and every line stays editable afterwards.
 */
function StoreCopyField({
    businessName,
    packId,
    sells,
    onSells,
    copy,
    onCopy,
    inputCls,
    t,
}: {
    businessName: string;
    packId: string;
    sells: string;
    onSells: (v: string) => void;
    copy: StoreCopy | null;
    onCopy: (c: StoreCopy | null) => void;
    inputCls: string;
    t: TFn;
}) {
    const [writing, setWriting] = useState(false);
    const [failed, setFailed] = useState(false);
    const ready = businessName.trim().length > 0 && sells.trim().length >= 3;

    const write = async () => {
        if (!ready || writing) return;
        setWriting(true);
        setFailed(false);
        try {
            const { data } = await supabase.auth.getSession();
            const res = await fetch("/api/ai/store-copy", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(data.session?.access_token
                        ? { Authorization: `Bearer ${data.session.access_token}` }
                        : {}),
                },
                body: JSON.stringify({
                    business_name: businessName.trim(),
                    sells: sells.trim(),
                    pack_id: packId,
                }),
            });
            const body = (await res.json().catch(() => null)) as { copy?: StoreCopy } | null;
            if (!res.ok || !body?.copy) {
                setFailed(true);
                onCopy(null);
            } else {
                onCopy(body.copy);
            }
        } catch {
            setFailed(true);
            onCopy(null);
        } finally {
            setWriting(false);
        }
    };

    return (
        <Field label={t("wizard.basics.sells")} hint={t("wizard.basics.sellsHint")}>
            <textarea
                rows={2}
                value={sells}
                onChange={(e) => onSells(e.target.value)}
                placeholder={t("wizard.basics.sellsPlaceholder")}
                data-testid="wizard-sells"
                className={`${inputCls} resize-y`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={write}
                    disabled={!ready || writing}
                    data-testid="wizard-write-copy"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-opacity disabled:opacity-40"
                >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {writing ? t("wizard.basics.writing") : t("wizard.basics.writeCopy")}
                </button>
                {copy && (
                    <span data-testid="wizard-copy-ready" className="text-xs text-emerald-700">
                        {t("wizard.basics.copyReady")}
                    </span>
                )}
                {failed && (
                    <span role="status" data-testid="wizard-copy-failed" className="text-xs text-amber-700">
                        {t("wizard.basics.copyFailed")}
                    </span>
                )}
            </div>
            {copy && (
                <div className="mt-2 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <p className="text-sm font-semibold text-foreground">{copy.hero.headline.ar}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{copy.hero.sub.ar}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{copy.story.body.ar}</p>
                    <button
                        type="button"
                        onClick={() => onCopy(null)}
                        data-testid="wizard-copy-discard"
                        className="mt-2 text-xs font-semibold text-muted-foreground underline"
                    >
                        {t("wizard.basics.copyDiscard")}
                    </button>
                </div>
            )}
        </Field>
    );
}
