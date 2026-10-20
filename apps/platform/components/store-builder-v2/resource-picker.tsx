"use client";

// =====================================================================
// Resource pickers — Builder v2
// =====================================================================
// Section props reference products, categories and destinations by raw
// value. These render that reference as something a merchant can
// recognise and choose, while storing exactly what the section schema
// already expects — so switching a field to a picker never rewrites a
// stored value or changes what the storefront reads.
// =====================================================================

import { useMemo, useState, type ReactElement } from "react";
import Image from "next/image";
import { ChevronDown, GripVertical, Search, X } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { STRINGS, t as tx } from "@/lib/editor-i18n";
import {
    LINK_PAGES,
    buildHref,
    classifyHref,
    type LinkTargetKind,
} from "@/lib/section-field-widgets";
import {
    useBuilderAttributes,
    useBuilderCategories,
    useBuilderProducts,
    type BuilderCategory,
    type BuilderProduct,
} from "@/hooks/use-builder-resources";
import { cn } from "@/lib/utils";

const FIELD_CLS =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Label({ children }: { children: React.ReactNode }) {
    return <span className="mb-1 block text-xs font-medium text-muted-foreground">{children}</span>;
}

/** Thumbnail + name row, shared by both entity pickers. */
function ResourceRow({
    image,
    name,
    note,
    muted,
}: {
    image?: string | null;
    name: string;
    note?: string;
    muted?: boolean;
}) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            {image ? (
                // unoptimized: a product or category image can be any URL a
                // merchant saved, not only hosts in images.remotePatterns, and
                // an optimized <Image> refuses the rest.
                <Image src={image} alt="" width={28} height={28} unoptimized className="h-7 w-7 shrink-0 rounded object-cover" />
            ) : (
                <span className="h-7 w-7 shrink-0 rounded bg-muted" />
            )}
            <span className={cn("min-w-0 truncate", muted && "text-muted-foreground")}>{name}</span>
            {note && <span className="shrink-0 text-xs text-muted-foreground">· {note}</span>}
        </span>
    );
}

interface Choice {
    id: string;
    name: string;
    image_url: string | null;
    note?: string;
}

/** Searchable dropdown over a list of choices. */
function ChoiceList({
    choices,
    onPick,
    locale,
    exclude,
}: {
    choices: Choice[];
    onPick: (id: string) => void;
    locale: LocaleCode;
    exclude?: Set<string>;
}) {
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return choices
            .filter((c) => !exclude?.has(c.id))
            .filter((c) => !q || c.name.toLowerCase().includes(q));
    }, [choices, query, exclude]);

    return (
        <div className="rounded-lg border border-border bg-popover shadow-md">
            <div className="flex items-center gap-2 border-b border-border px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tx(STRINGS.picker.search, locale)}
                    aria-label={tx(STRINGS.picker.search, locale)}
                    className="w-full bg-transparent py-2 text-sm focus:outline-none"
                />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 && (
                    <li className="px-3 py-3 text-sm text-muted-foreground">
                        {tx(STRINGS.picker.no_results, locale)}
                    </li>
                )}
                {filtered.map((c) => (
                    <li key={c.id}>
                        <button
                            type="button"
                            onClick={() => onPick(c.id)}
                            className="flex w-full items-center px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                            <ResourceRow image={c.image_url} name={c.name} note={c.note} />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function toProductChoices(products: BuilderProduct[], locale: LocaleCode): Choice[] {
    return products.map((p) => ({
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        // A section may legitimately point at a hidden product; say so rather
        // than leaving the merchant to wonder why it never appears.
        note: p.is_visible === false ? tx(STRINGS.picker.hidden_product, locale) : undefined,
    }));
}

function toCategoryChoices(categories: BuilderCategory[]): Choice[] {
    return categories.map((c) => ({ id: c.id, name: c.name, image_url: c.image_url }));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Single-value picker                                                  */
/* ─────────────────────────────────────────────────────────────────── */

export function SinglePicker({
    label,
    value,
    onChange,
    choices,
    placeholder,
    locale,
    testId,
}: {
    label: string;
    value: string | undefined;
    onChange: (next: string | undefined) => void;
    choices: Choice[];
    placeholder: string;
    locale: LocaleCode;
    testId?: string;
}): ReactElement {
    const [open, setOpen] = useState(false);
    const selected = choices.find((c) => c.id === value);

    return (
        <div className="space-y-1">
            <Label>{label}</Label>
            <div className="relative">
                <button
                    type="button"
                    data-testid={testId}
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className={cn(FIELD_CLS, "flex items-center justify-between gap-2 text-left")}
                >
                    {selected ? (
                        <ResourceRow image={selected.image_url} name={selected.name} note={selected.note} />
                    ) : value ? (
                        // The stored id no longer resolves — show the raw value
                        // rather than an empty box that looks like "unset".
                        <ResourceRow name={value} note={tx(STRINGS.picker.missing, locale)} muted />
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        aria-label={tx(STRINGS.auto_form.clear, locale)}
                        className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
                {open && (
                    <div className="absolute z-20 mt-1 w-full">
                        <ChoiceList
                            choices={choices}
                            locale={locale}
                            onPick={(id) => {
                                onChange(id);
                                setOpen(false);
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Multi-value picker                                                   */
/* ─────────────────────────────────────────────────────────────────── */

export function MultiPicker({
    label,
    value,
    onChange,
    choices,
    placeholder,
    locale,
    testId,
}: {
    label: string;
    value: string[] | undefined;
    onChange: (next: string[]) => void;
    choices: Choice[];
    placeholder: string;
    locale: LocaleCode;
    testId?: string;
}): ReactElement {
    const [open, setOpen] = useState(false);
    const ids = value ?? [];
    const selectedSet = useMemo(() => new Set(ids), [ids]);

    // Order matters: these lists drive display order on the storefront.
    const move = (from: number, to: number) => {
        if (to < 0 || to >= ids.length) return;
        const next = [...ids];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    };

    return (
        <div className="space-y-1">
            <Label>{label}</Label>
            <ul className="space-y-1">
                {ids.length === 0 && (
                    <li className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                        {tx(STRINGS.picker.none_selected, locale)}
                    </li>
                )}
                {ids.map((id, i) => {
                    const c = choices.find((x) => x.id === id);
                    return (
                        <li
                            key={`${id}-${i}`}
                            className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5"
                        >
                            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <div className="min-w-0 flex-1 text-sm">
                                {c ? (
                                    <ResourceRow image={c.image_url} name={c.name} note={c.note} />
                                ) : (
                                    <ResourceRow name={id} note={tx(STRINGS.picker.missing, locale)} muted />
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => move(i, i - 1)}
                                disabled={i === 0}
                                aria-label={tx(STRINGS.auto_form.move_up, locale)}
                                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                onClick={() => move(i, i + 1)}
                                disabled={i === ids.length - 1}
                                aria-label={tx(STRINGS.auto_form.move_down, locale)}
                                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                onClick={() => onChange(ids.filter((_, j) => j !== i))}
                                aria-label={tx(STRINGS.auto_form.remove_item, locale)}
                                className="rounded p-1 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="relative">
                <button
                    type="button"
                    data-testid={testId}
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                    {placeholder}
                </button>
                {open && (
                    <div className="absolute z-20 mt-1 w-full">
                        <ChoiceList
                            choices={choices}
                            locale={locale}
                            exclude={selectedSet}
                            onPick={(id) => {
                                onChange([...ids, id]);
                                setOpen(false);
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Field-level wrappers                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export function ProductPickerField(props: {
    label: string;
    value: unknown;
    onChange: (next: unknown) => void;
    multiple: boolean;
    locale: LocaleCode;
    testId?: string;
}): ReactElement {
    const { data: products = [] } = useBuilderProducts();
    const choices = useMemo(() => toProductChoices(products, props.locale), [products, props.locale]);

    if (props.multiple) {
        return (
            <MultiPicker
                label={props.label}
                value={Array.isArray(props.value) ? (props.value as string[]) : []}
                onChange={props.onChange}
                choices={choices}
                placeholder={tx(STRINGS.picker.choose_products, props.locale)}
                locale={props.locale}
                testId={props.testId}
            />
        );
    }
    return (
        <SinglePicker
            label={props.label}
            value={typeof props.value === "string" ? props.value : undefined}
            onChange={props.onChange}
            choices={choices}
            placeholder={tx(STRINGS.picker.choose_product, props.locale)}
            locale={props.locale}
            testId={props.testId}
        />
    );
}

export function CategoryPickerField(props: {
    label: string;
    value: unknown;
    onChange: (next: unknown) => void;
    multiple: boolean;
    /** `slug` fields store the slug; id fields store the id. */
    stores: "id" | "slug";
    locale: LocaleCode;
    testId?: string;
}): ReactElement {
    const { data: categories = [] } = useBuilderCategories();
    const choices = useMemo(() => toCategoryChoices(categories), [categories]);

    if (props.multiple) {
        return (
            <MultiPicker
                label={props.label}
                value={Array.isArray(props.value) ? (props.value as string[]) : []}
                onChange={props.onChange}
                choices={choices}
                placeholder={tx(STRINGS.picker.choose_categories, props.locale)}
                locale={props.locale}
                testId={props.testId}
            />
        );
    }

    // Slug-valued field: present ids in the list, store the slug.
    const bySlug = categories.find((c) => c.slug === props.value);
    return (
        <SinglePicker
            label={props.label}
            value={props.stores === "slug" ? bySlug?.id : (props.value as string | undefined)}
            onChange={(id) => {
                if (props.stores !== "slug") return props.onChange(id);
                const cat = categories.find((c) => c.id === id);
                props.onChange(cat?.slug ?? undefined);
            }}
            choices={choices}
            placeholder={tx(STRINGS.picker.choose_category, props.locale)}
            locale={props.locale}
            testId={props.testId}
        />
    );
}

export function AttributePickerField(props: {
    label: string;
    value: unknown;
    onChange: (next: unknown) => void;
    multiple: boolean;
    locale: LocaleCode;
    testId?: string;
}): ReactElement {
    const { data: defs = [] } = useBuilderAttributes();
    // Sections store the attribute KEY, not its id — the key is stable,
    // readable in a config diff, and survives an attribute being recreated.
    const choices = useMemo<Choice[]>(
        () =>
            defs.map((d) => ({
                id: d.key,
                name:
                    (props.locale === "ar" ? d.name_i18n.ar ?? d.name_i18n.en : d.name_i18n.en ?? d.name_i18n.ar) ??
                    d.key,
                image_url: null,
                note: d.key,
            })),
        [defs, props.locale],
    );

    if (props.multiple) {
        return (
            <MultiPicker
                label={props.label}
                value={Array.isArray(props.value) ? (props.value as string[]) : []}
                onChange={props.onChange}
                choices={choices}
                placeholder={tx(STRINGS.picker.choose_attributes, props.locale)}
                locale={props.locale}
                testId={props.testId}
            />
        );
    }
    return (
        <SinglePicker
            label={props.label}
            value={typeof props.value === "string" ? props.value : undefined}
            onChange={props.onChange}
            choices={choices}
            placeholder={tx(STRINGS.picker.choose_attribute, props.locale)}
            locale={props.locale}
            testId={props.testId}
        />
    );
}

const TARGET_KINDS: LinkTargetKind[] = ["page", "category", "product", "external"];

export function LinkPickerField({
    label,
    value,
    onChange,
    locale,
    testId,
}: {
    label: string;
    value: unknown;
    onChange: (next: unknown) => void;
    locale: LocaleCode;
    testId?: string;
}): ReactElement {
    const href = typeof value === "string" ? value : "";
    const current = classifyHref(href);
    const { data: products = [] } = useBuilderProducts();
    const { data: categories = [] } = useBuilderCategories();

    const kindLabel: Record<LinkTargetKind, string> = {
        page: tx(STRINGS.picker.target_page, locale),
        category: tx(STRINGS.picker.target_category, locale),
        product: tx(STRINGS.picker.target_product, locale),
        external: tx(STRINGS.picker.target_external, locale),
    };

    const pageLabel = (key: string) =>
        tx(
            (STRINGS.picker as Record<string, { en: string; ar: string; ku: string }>)[`page_${key}`] ??
                STRINGS.picker.target_page,
            locale,
        );

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <div className="flex flex-wrap gap-1" role="group" aria-label={tx(STRINGS.picker.link_to, locale)}>
                {TARGET_KINDS.map((k) => (
                    <button
                        key={k}
                        type="button"
                        aria-pressed={current.kind === k}
                        // Switching target clears the value: a category slug is
                        // not a valid product slug, and carrying it over would
                        // silently produce a dead link.
                        onClick={() => onChange(k === current.kind ? href : "")}
                        className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            current.kind === k
                                ? "border-foreground bg-foreground text-background"
                                : "border-border hover:bg-muted",
                        )}
                    >
                        {kindLabel[k]}
                    </button>
                ))}
            </div>

            {current.kind === "page" && (
                <select
                    data-testid={testId}
                    className={FIELD_CLS}
                    value={current.value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={label}
                >
                    <option value="">{tx(STRINGS.picker.none_selected, locale)}</option>
                    {LINK_PAGES.map((p) => (
                        <option key={p.path} value={p.path}>
                            {pageLabel(p.labelKey)}
                        </option>
                    ))}
                </select>
            )}

            {current.kind === "category" && (
                <select
                    data-testid={testId}
                    className={FIELD_CLS}
                    value={current.value}
                    onChange={(e) => onChange(buildHref("category", e.target.value))}
                    aria-label={label}
                >
                    <option value="">{tx(STRINGS.picker.choose_category, locale)}</option>
                    {categories
                        .filter((c) => c.slug)
                        .map((c) => (
                            <option key={c.id} value={c.slug!}>
                                {c.name}
                            </option>
                        ))}
                </select>
            )}

            {current.kind === "product" && (
                <select
                    data-testid={testId}
                    className={FIELD_CLS}
                    value={current.value}
                    onChange={(e) => onChange(buildHref("product", e.target.value))}
                    aria-label={label}
                >
                    <option value="">{tx(STRINGS.picker.choose_product, locale)}</option>
                    {products
                        .filter((p) => p.slug)
                        .map((p) => (
                            <option key={p.id} value={p.slug!}>
                                {p.name}
                            </option>
                        ))}
                </select>
            )}

            {current.kind === "external" && (
                <input
                    data-testid={testId}
                    className={FIELD_CLS}
                    value={current.value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={tx(STRINGS.picker.external_placeholder, locale)}
                    aria-label={label}
                />
            )}

            {href && (
                <p className="text-[11px] text-muted-foreground">
                    {tx(STRINGS.picker.stored_as, locale)} <code>{href}</code>
                </p>
            )}
        </div>
    );
}
