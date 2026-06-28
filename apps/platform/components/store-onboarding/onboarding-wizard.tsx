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
import {
    buildStarterStoreConfigV2,
    STARTER_TEMPLATES,
    type WizardIndustry,
} from "@/lib/starter-store";
import { cn } from "@/lib/utils";

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

        const config = buildStarterStoreConfigV2({
            templateId,
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
                body: JSON.stringify({ tenant_id: tenantId, config }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                    error?: string;
                };
                setError(data.error || "Couldn't create your store. Please try again.");
                setSubmitting(false);
                return;
            }
            router.push("/store/edit");
        } catch {
            setError("Network error. Please check your connection and try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
            {/* Header */}
            <div className="mb-8 text-center">
                <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
                    <Store className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Let&apos;s build your store
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    A few quick steps and you&apos;ll be in the editor with a real
                    storefront — not a blank page.
                </p>
            </div>

            <StepHeader step={step} />

            <div className="rounded-2xl border border-border bg-(--card-bg) p-6 shadow-(--card-shadow)">
                {step === 0 ? (
                    <IntentStep
                        industries={industries}
                        selected={vertical}
                        onSelect={handlePickVertical}
                    />
                ) : step === 1 ? (
                    <TemplateStep
                        templateId={templateId}
                        recommendedId={recommendedId}
                        onSelect={setTemplateId}
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
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </button>

                        {step === 1 ? (
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={!templateId}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover) disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Continue
                                <ArrowRight className="h-4 w-4" />
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
                                        Creating…
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Create my store
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
                You can change everything later in the editor.
            </p>
        </div>
    );
}

function StepHeader({ step }: { step: Step }) {
    const steps = ["What you sell", "Pick a starter", "Business basics"];
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
                            <span className="ml-1 h-px w-5 bg-border" />
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
}: {
    industries: WizardIndustry[];
    selected: string | null;
    onSelect: (industry: WizardIndustry) => void;
}) {
    return (
        <div>
            <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">
                    What do you sell?
                </h2>
                <p className="text-xs text-muted-foreground">
                    We&apos;ll recommend a starting layout. You can change it next.
                </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {industries.map((industry) => {
                    const Icon =
                        (industry.icon ? ICON_REGISTRY[industry.icon] : null) ?? Store;
                    const active = industry.id === selected;
                    const label = industry.name_ar ?? industry.name;
                    const sublabel =
                        industry.name_ar && industry.name_ar !== industry.name
                            ? industry.name
                            : null;
                    return (
                        <li key={industry.id}>
                            <button
                                type="button"
                                aria-pressed={active}
                                onClick={() => onSelect(industry)}
                                className={cn(
                                    "flex h-full w-full flex-col items-start gap-2 rounded-xl border bg-(--card-bg) p-3.5 text-left transition-all duration-150",
                                    active
                                        ? "border-foreground ring-1 ring-foreground"
                                        : "border-border shadow-(--card-shadow) hover:-translate-y-0.5 hover:border-(--border-hover)",
                                )}
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                    <Icon className="h-4.5 w-4.5" />
                                </span>
                                <span className="text-sm font-semibold text-foreground">
                                    {label}
                                </span>
                                {sublabel && (
                                    <span className="text-[11px] text-muted-foreground leading-tight">
                                        {sublabel}
                                    </span>
                                )}
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
}) {
    const inputCls =
        "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none";

    return (
        <div className="space-y-5">
            <Field label="Business name">
                <input
                    type="text"
                    value={businessName}
                    onChange={(e) => onBusinessName(e.target.value)}
                    placeholder="Your store name"
                    className={inputCls}
                />
            </Field>

            <Field label="Logo" hint="Shown in your store header. Optional — PNG or SVG, under 2MB.">
                <LogoField
                    tenantId={tenantId}
                    logoUrl={logoUrl}
                    onChange={onLogoUrl}
                />
            </Field>

            <Field
                label="WhatsApp number"
                hint="Customers tap to order on WhatsApp. Optional — add it later if you prefer."
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
                    label="Delivery fee (IQD)"
                    hint="Standard COD delivery charge. Leave blank to set up later."
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
                    label="Free delivery over (IQD)"
                    hint="Optional. Orders at/above this ship free."
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

            <Field label="Brand colour" hint="Used across buttons and accents. Change it anytime.">
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
                            aria-label="Custom brand colour"
                        />
                        Custom
                    </label>
                </div>
            </Field>
        </div>
    );
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function LogoField({
    tenantId,
    logoUrl,
    onChange,
}: {
    tenantId: string;
    logoUrl: string | null;
    onChange: (url: string | null) => void;
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
                setError("Logo must be under 2MB.");
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
                setError("Upload failed. Please try again.");
            } finally {
                setUploading(false);
            }
        },
        [tenantId, onChange],
    );

    return (
        <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                {logoUrl ? (
                    <Image
                        src={logoUrl}
                        alt="Logo preview"
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
                            ? "Uploading…"
                            : logoUrl
                              ? "Replace"
                              : "Upload logo"}
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
                            Remove
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
}: {
    templateId: string;
    recommendedId: string | null;
    onSelect: (id: string) => void;
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
                        Pick a starting point
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        We&apos;ll set up your home page with these sections. Everything
                        is editable.
                    </p>
                </div>
            </div>

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {templates.map((tpl) => {
                    const selected = tpl.id === templateId;
                    const recommended = tpl.id === recommendedId;
                    const name = tpl.name_i18n.en ?? tpl.id;
                    const desc = tpl.description_i18n.en ?? "";
                    return (
                        <li key={tpl.id}>
                            <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onSelect(tpl.id)}
                                className={cn(
                                    "flex w-full flex-col gap-2 rounded-xl border bg-(--card-bg) p-3 text-left transition-all duration-150",
                                    selected
                                        ? "border-foreground shadow-(--card-shadow-hover) ring-1 ring-foreground"
                                        : "border-border shadow-(--card-shadow) hover:-translate-y-0.5 hover:border-(--border-hover)",
                                )}
                            >
                                <TemplateThumbnail
                                    count={tpl.sections.length}
                                    selected={selected}
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-foreground">
                                        {name}
                                    </span>
                                    {recommended ? (
                                        <span className="inline-flex h-5 items-center rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                            Recommended
                                        </span>
                                    ) : (
                                        <span className="inline-flex h-5 items-center rounded-full bg-muted/60 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
                                            {tpl.sections.length} sections
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

function TemplateThumbnail({
    count,
    selected,
}: {
    count: number;
    selected: boolean;
}) {
    const bars = Array.from({ length: Math.min(count, 5) }, (_, i) => i);
    return (
        <div
            className={cn(
                "flex aspect-video w-full flex-col justify-center gap-1.5 rounded px-3 py-2 transition-colors",
                selected
                    ? "bg-foreground/10"
                    : "bg-linear-to-br from-muted/40 to-muted/10",
            )}
        >
            {bars.map((i) => (
                <div
                    key={i}
                    className={cn(
                        "h-1.5 rounded-full",
                        selected ? "bg-foreground/40" : "bg-foreground/20",
                        i === 0 && "w-3/4",
                        i === 1 && "w-full",
                        i === 2 && "w-2/3",
                        i === 3 && "w-5/6",
                        i === 4 && "w-1/2",
                    )}
                />
            ))}
        </div>
    );
}
