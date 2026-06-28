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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Loader2,
    LayoutTemplate,
    Shirt,
    Sparkles,
    Smartphone,
    Apple,
    Sofa,
    Store,
    type LucideIcon,
} from "lucide-react";
import {
    buildStarterStoreConfigV2,
    recommendedTemplateForVertical,
    STARTER_TEMPLATES,
    STARTER_VERTICALS,
} from "@/lib/starter-store";
import { cn } from "@/lib/utils";

interface OnboardingWizardProps {
    tenantId: string;
    defaultBusinessName: string;
    defaultWhatsapp?: string;
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

/** Icon per vertical id (kept here so the lib stays free of UI deps). */
const VERTICAL_ICON: Record<string, LucideIcon> = {
    fashion: Shirt,
    beauty: Sparkles,
    electronics: Smartphone,
    food: Apple,
    home_goods: Sofa,
    general: Store,
};

type Step = 0 | 1 | 2;

export function OnboardingWizard({
    tenantId,
    defaultBusinessName,
    defaultWhatsapp,
}: OnboardingWizardProps) {
    const router = useRouter();

    const [step, setStep] = useState<Step>(0);
    const [vertical, setVertical] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState<string>(
        STARTER_TEMPLATES[0]?.id ?? "",
    );
    const [businessName, setBusinessName] = useState(defaultBusinessName);
    const [whatsapp, setWhatsapp] = useState(defaultWhatsapp ?? "");
    const [brandColor, setBrandColor] = useState<string>(COLOR_PRESETS[0].hex);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The template recommended by the chosen vertical (badged in step 2).
    const recommendedId = useMemo(
        () => (vertical ? recommendedTemplateForVertical(vertical) : null),
        [vertical],
    );

    const basicsValid = businessName.trim().length > 0;
    const canCreate = basicsValid && templateId.length > 0;

    const handlePickVertical = (id: string) => {
        setVertical(id);
        setTemplateId(recommendedTemplateForVertical(id));
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
            whatsappNumber: whatsapp.trim() || undefined,
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
                    <IntentStep selected={vertical} onSelect={handlePickVertical} />
                ) : step === 1 ? (
                    <TemplateStep
                        templateId={templateId}
                        recommendedId={recommendedId}
                        onSelect={setTemplateId}
                    />
                ) : (
                    <BasicsStep
                        businessName={businessName}
                        onBusinessName={setBusinessName}
                        whatsapp={whatsapp}
                        onWhatsapp={setWhatsapp}
                        brandColor={brandColor}
                        onBrandColor={setBrandColor}
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
    selected,
    onSelect,
}: {
    selected: string | null;
    onSelect: (id: string) => void;
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
                {STARTER_VERTICALS.map((v) => {
                    const Icon = VERTICAL_ICON[v.id] ?? Store;
                    const active = v.id === selected;
                    return (
                        <li key={v.id}>
                            <button
                                type="button"
                                aria-pressed={active}
                                onClick={() => onSelect(v.id)}
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
                                    {v.label}
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
    businessName,
    onBusinessName,
    whatsapp,
    onWhatsapp,
    brandColor,
    onBrandColor,
}: {
    businessName: string;
    onBusinessName: (v: string) => void;
    whatsapp: string;
    onWhatsapp: (v: string) => void;
    brandColor: string;
    onBrandColor: (v: string) => void;
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
