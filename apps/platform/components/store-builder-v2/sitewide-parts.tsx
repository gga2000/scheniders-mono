"use client";

// =====================================================================
// SitewideParts — the store's top bar, header and footer
// =====================================================================
// These sections live in `config.globals` and render on every storefront
// page. The Blocks tab shows them as a strip above the page's own sections;
// picking one opens the same section form the page sections use.
// =====================================================================

import { ArrowLeft, Eye, EyeOff, Megaphone, PanelBottom, PanelTop } from "lucide-react";
import { getSection } from "@scheniders/sections";
import type {
    AudienceSegment,
    Experiment,
    GlobalSections,
    LocaleCode,
    SectionInstance,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { SectionEditPanel } from "./section-edit-panel";

export type SitewideSlot = "promo_bar" | "header" | "footer";

export const SITEWIDE_SLOTS: SitewideSlot[] = ["promo_bar", "header", "footer"];

// Same built-in defaults the storefront falls back to when a slot is unset
// (apps/storefront/lib/global-slots.ts), so editing starts from what shows.
const DEFAULT_TYPE: Record<SitewideSlot, string> = {
    promo_bar: "announcement_bar",
    header: "site_header",
    footer: "site_footer",
};

const ICON: Record<SitewideSlot, typeof PanelTop> = {
    promo_bar: Megaphone,
    header: PanelTop,
    footer: PanelBottom,
};

const LABEL = {
    promo_bar: STRINGS.inspector.sitewide_promo_bar,
    header: STRINGS.inspector.sitewide_header,
    footer: STRINGS.inspector.sitewide_footer,
} as const;

/** The id the storefront preview gives an unset slot's default section. */
export function defaultSlotId(slot: SitewideSlot): string {
    return `__default_${slot}__`;
}

/** The instance a slot shows: the store's own, else the built-in default. */
export function sitewideInstance(
    globals: GlobalSections | undefined,
    slot: SitewideSlot,
): SectionInstance | null {
    const own = globals?.[slot];
    if (own) return own;
    const def = getSection(DEFAULT_TYPE[slot]);
    if (!def) return null;
    return {
        id: defaultSlotId(slot),
        type: DEFAULT_TYPE[slot],
        enabled: true,
        base: def.defaultProps as Record<string, unknown>,
    };
}

/** Which slot a section id clicked in the preview belongs to, if any. */
export function slotForSectionId(
    globals: GlobalSections | undefined,
    id: string | null | undefined,
): SitewideSlot | null {
    if (!id) return null;
    for (const slot of SITEWIDE_SLOTS) {
        if (globals?.[slot]?.id === id || id === defaultSlotId(slot)) return slot;
    }
    return null;
}

export interface SitewidePartsProps {
    globals: GlobalSections | undefined;
    onChange: (slot: SitewideSlot, next: SectionInstance) => void;
    editing: SitewideSlot | null;
    onEdit: (slot: SitewideSlot | null) => void;
    locale: LocaleCode;
    tenantId?: string;
    activeBreakpoint?: "mobile" | "tablet" | "desktop";
    experiments?: Experiment[];
    segments?: AudienceSegment[];
}

/** The compact strip shown above the page's sections. */
export function SitewideStrip({
    globals,
    onChange,
    onEdit,
    locale,
}: Pick<SitewidePartsProps, "globals" | "onChange" | "onEdit" | "locale">): React.ReactElement {
    return (
        <section
            data-testid="sitewide-strip"
            aria-label={t(STRINGS.inspector.sitewide_title, locale)}
            className="shrink-0 border-b border-(--card-border) px-3 py-2.5"
        >
            <h3 className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                {t(STRINGS.inspector.sitewide_title, locale)}
            </h3>
            <ul className="flex flex-col gap-1">
                {SITEWIDE_SLOTS.map((slot) => {
                    const inst = sitewideInstance(globals, slot);
                    if (!inst) return null;
                    const Icon = ICON[slot];
                    const shown = inst.enabled !== false;
                    return (
                        <li key={slot} className="flex items-center gap-1">
                            <button
                                type="button"
                                data-testid={`sitewide-edit-${slot}`}
                                onClick={() => onEdit(slot)}
                                className={cn(
                                    "flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-black/5",
                                    !shown && "text-muted-foreground",
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span>{t(LABEL[slot], locale)}</span>
                            </button>
                            <button
                                type="button"
                                data-testid={`sitewide-toggle-${slot}`}
                                aria-pressed={shown}
                                aria-label={t(STRINGS.inspector.sitewide_show, locale)}
                                onClick={() => onChange(slot, { ...inst, enabled: !shown })}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            >
                                {shown ? (
                                    <Eye className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** Full-height form for one slot, replacing the page section list. */
export function SitewideEditor({
    globals,
    onChange,
    editing,
    onEdit,
    locale,
    tenantId,
    activeBreakpoint,
    experiments,
    segments,
}: SitewidePartsProps): React.ReactElement | null {
    if (!editing) return null;
    const inst = sitewideInstance(globals, editing);
    if (!inst) return null;
    return (
        <div data-testid={`sitewide-editor-${editing}`} className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-(--card-border) px-3 py-2.5">
                <button
                    type="button"
                    data-testid="sitewide-back"
                    onClick={() => onEdit(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(STRINGS.inspector.sitewide_back, locale)}
                </button>
                <h3 className="mt-1.5 text-sm font-semibold">{t(LABEL[editing], locale)}</h3>
                <p className="text-xs text-muted-foreground">{t(STRINGS.inspector.sitewide_hint, locale)}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
                <SectionEditPanel
                    instance={inst}
                    onChange={(next) => onChange(editing, next)}
                    onClose={() => onEdit(null)}
                    tenantId={tenantId}
                    experiments={experiments}
                    segments={segments}
                    activeLocale={locale}
                    activeBreakpoint={activeBreakpoint}
                    inline
                />
            </div>
        </div>
    );
}
