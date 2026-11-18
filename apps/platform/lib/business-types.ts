// =====================================================================
// What a store sells — asked once at signup («شنو تبيع؟», Fermi B10)
// =====================================================================
// The merchant ticks one or more kinds of goods; the list is saved on
// `tenants.business_types` in the order ticked. From it the app picks:
//   • the content pack the store starts with (the first type's pack);
//   • the examples the product, category and attribute forms show, so a
//     clothing shop is never shown a perfume as the example;
//   • the size and colour presets the variant builder offers;
//   • the starter attribute set ("category template") on the existing
//     product_attribute_defs engine.
// A store made before this has an empty list and keeps the neutral
// examples and generic presets it saw before.
// =====================================================================

import { resolveI18n, type I18nString, type LocaleCode } from "@scheniders/shared";
import type { PackAttribute } from "@/lib/store-templates/content-packs";
import { fashionPack } from "@/lib/store-templates/content-packs/fashion";
import { electronicsPack } from "@/lib/store-templates/content-packs/electronics";
import type { VariantOptionType } from "@/types/product";

/** The same list as the tenants_business_types_known CHECK in the database. */
export const BUSINESS_TYPE_IDS = [
    "clothing",
    "perfume",
    "beauty",
    "electronics",
    "home",
    "car",
    "toys",
    "books",
    "accessories",
    "food",
    "other",
] as const;

export type BusinessTypeId = (typeof BUSINESS_TYPE_IDS)[number];

/** One option group the variant builder can add in a click. */
export interface VariantPreset {
    id: string;
    name_i18n: I18nString;
    option_type: VariantOptionType;
    values: { label_i18n: I18nString; hex?: string }[];
}

/** Examples the forms show as placeholders. */
export interface BusinessExamples {
    product_i18n: I18nString;
    category_i18n: I18nString;
    /** Latin in every language, like every category address. */
    category_slug_i18n: I18nString;
    attribute_i18n: I18nString;
}

/** A starter attribute set on the product_attribute_defs engine. */
export interface AttributeTemplate {
    id: string;
    name_i18n: I18nString;
    attributes: PackAttribute[];
}

export interface BusinessType {
    id: BusinessTypeId;
    label_i18n: I18nString;
    /** Lucide icon name; the screen maps it to the component. */
    icon: string;
    /** The content pack the store starts with when this type is ticked first. */
    pack_id: string;
    /** Matches the onboarding wizard's industry row that fits this type. */
    industry: RegExp;
    /** Absent → the forms keep their neutral wording. */
    examples?: BusinessExamples;
    presets: VariantPreset[];
    template?: AttributeTemplate;
}

/* ── Variant presets ───────────────────────────────────────────────── */

const v = (ar: string, en: string, hex?: string) => ({ label_i18n: { ar, en }, ...(hex ? { hex } : {}) });

const LETTER_SIZES: VariantPreset = {
    id: "letter_sizes",
    name_i18n: { ar: "المقاس", en: "Size" },
    option_type: "size",
    values: ["S", "M", "L", "XL", "XXL"].map((s) => v(s, s)),
};

const SHOE_SIZES: VariantPreset = {
    id: "shoe_sizes",
    name_i18n: { ar: "مقاس الحذاء", en: "Shoe size" },
    option_type: "size",
    values: ["38", "39", "40", "41", "42", "43", "44", "45"].map((s) => v(s, s)),
};

const COLOURS: VariantPreset = {
    id: "colours",
    name_i18n: { ar: "اللون", en: "Colour" },
    option_type: "color",
    values: [
        v("أسود", "Black", "#111111"),
        v("أبيض", "White", "#FFFFFF"),
        v("رمادي", "Grey", "#9CA3AF"),
        v("كحلي", "Navy", "#1E3A5F"),
        v("بيج", "Beige", "#D6C7A8"),
    ],
};

const METAL_COLOURS: VariantPreset = {
    id: "metal_colours",
    name_i18n: { ar: "اللون", en: "Colour" },
    option_type: "color",
    values: [v("ذهبي", "Gold", "#D4AF37"), v("فضي", "Silver", "#C0C0C0"), v("وردي", "Rose gold", "#B76E79")],
};

const VOLUME_ML: VariantPreset = {
    id: "volume_ml",
    name_i18n: { ar: "الحجم", en: "Size" },
    option_type: "size",
    values: [v("30 مل", "30 ml"), v("50 مل", "50 ml"), v("100 مل", "100 ml")],
};

const STORAGE: VariantPreset = {
    id: "storage",
    name_i18n: { ar: "السعة", en: "Storage" },
    option_type: "custom",
    values: ["64GB", "128GB", "256GB"].map((s) => v(s, s)),
};

const WEIGHT: VariantPreset = {
    id: "weight",
    name_i18n: { ar: "الوزن", en: "Weight" },
    option_type: "size",
    values: [v("250 غم", "250 g"), v("500 غم", "500 g"), v("1 كغم", "1 kg")],
};

const ITEM_SIZES: VariantPreset = {
    id: "item_sizes",
    name_i18n: { ar: "الحجم", en: "Size" },
    option_type: "size",
    values: [v("صغير", "Small"), v("وسط", "Medium"), v("كبير", "Large")],
};

/* ── Category templates (product_attribute_defs) ───────────────────── */

const packAttribute = (attributes: PackAttribute[], key: string): PackAttribute => {
    const found = attributes.find((a) => a.key === key);
    if (!found) throw new Error(`content pack attribute "${key}" is missing`);
    return found;
};

const groupKey = (key: string, ar: string, en: string) => ({ key, label_i18n: { ar, en } });
const option = (value: string, ar: string, en: string) => ({ value, label_i18n: { ar, en } });

const CLOTHING_TEMPLATE: AttributeTemplate = {
    id: "clothing",
    name_i18n: { ar: "ملابس", en: "Clothing" },
    attributes: [
        {
            key: "size_chart",
            name_i18n: { ar: "جدول المقاسات", en: "Size chart" },
            kind: "group_list",
            group_keys: [
                groupKey("chest", "الصدر (سم)", "Chest (cm)"),
                groupKey("waist", "الخصر (سم)", "Waist (cm)"),
                groupKey("length", "الطول (سم)", "Length (cm)"),
            ],
            is_filterable: false,
            display_order: 1,
        },
        packAttribute(fashionPack.attributes, "material"),
        packAttribute(fashionPack.attributes, "fit"),
    ],
};

const FURNITURE_TEMPLATE: AttributeTemplate = {
    id: "furniture",
    name_i18n: { ar: "أثاث", en: "Furniture" },
    attributes: [
        {
            key: "dimensions",
            name_i18n: { ar: "الأبعاد", en: "Dimensions" },
            kind: "group_list",
            group_keys: [
                groupKey("length", "الطول (سم)", "Length (cm)"),
                groupKey("width", "العرض (سم)", "Width (cm)"),
                groupKey("height", "الارتفاع (سم)", "Height (cm)"),
            ],
            is_filterable: false,
            display_order: 1,
        },
        {
            key: "furniture_material",
            name_i18n: { ar: "الخامة", en: "Material" },
            kind: "enum",
            options: [
                option("wood", "خشب", "Wood"),
                option("metal", "معدن", "Metal"),
                option("fabric", "قماش", "Fabric"),
                option("leather", "جلد", "Leather"),
                option("glass", "زجاج", "Glass"),
                option("plastic", "بلاستك", "Plastic"),
            ],
            display_order: 2,
        },
    ],
};

const ELECTRONICS_TEMPLATE: AttributeTemplate = {
    id: "electronics",
    name_i18n: { ar: "إلكترونيات", en: "Electronics" },
    attributes: [
        packAttribute(electronicsPack.attributes, "warranty_months"),
        packAttribute(electronicsPack.attributes, "condition"),
    ],
};

const CAR_TEMPLATE: AttributeTemplate = {
    id: "car",
    name_i18n: { ar: "إكسسوارات سيارات", en: "Car accessories" },
    attributes: [
        {
            key: "fits_car",
            name_i18n: { ar: "يناسب السيارة", en: "Fits" },
            kind: "group_list",
            group_keys: [
                groupKey("make", "الشركة", "Make"),
                groupKey("model", "الموديل", "Model"),
                groupKey("year", "السنة", "Year"),
            ],
            is_filterable: false,
            display_order: 1,
        },
    ],
};

const TOYS_TEMPLATE: AttributeTemplate = {
    id: "toys",
    name_i18n: { ar: "ألعاب", en: "Toys" },
    attributes: [
        {
            key: "age_from",
            name_i18n: { ar: "العمر من", en: "Age from" },
            kind: "range",
            range_min: 0,
            range_max: 14,
            unit_i18n: { ar: "سنة", en: "years" },
            display_order: 1,
        },
        {
            key: "needs_batteries",
            name_i18n: { ar: "يحتاج بطاريات", en: "Needs batteries" },
            kind: "boolean",
            display_order: 2,
        },
    ],
};

const BOOKS_TEMPLATE: AttributeTemplate = {
    id: "books",
    name_i18n: { ar: "كتب", en: "Books" },
    attributes: [
        { key: "author", name_i18n: { ar: "المؤلف", en: "Author" }, kind: "text", is_filterable: false, display_order: 1 },
        {
            key: "book_language",
            name_i18n: { ar: "اللغة", en: "Language" },
            kind: "enum",
            options: [option("ar", "عربي", "Arabic"), option("en", "إنكليزي", "English"), option("ku", "كردي", "Kurdish")],
            display_order: 2,
        },
        { key: "publisher", name_i18n: { ar: "دار النشر", en: "Publisher" }, kind: "text", is_filterable: false, display_order: 3 },
    ],
};

/** Every ready set, in the order the attributes screen offers them. */
export const ATTRIBUTE_TEMPLATES: AttributeTemplate[] = [
    CLOTHING_TEMPLATE,
    FURNITURE_TEMPLATE,
    ELECTRONICS_TEMPLATE,
    CAR_TEMPLATE,
    TOYS_TEMPLATE,
    BOOKS_TEMPLATE,
];

/* ── The types ─────────────────────────────────────────────────────── */

const examples = (
    product: [string, string],
    category: [string, string],
    categorySlug: string,
    attribute: [string, string],
): BusinessExamples => ({
    product_i18n: { ar: `مثال: ${product[0]}`, en: `e.g. ${product[1]}` },
    category_i18n: { ar: `مثال: ${category[0]}`, en: `e.g. ${category[1]}` },
    category_slug_i18n: { ar: `مثال: ${categorySlug}`, en: `e.g. ${categorySlug}` },
    attribute_i18n: { ar: `مثال: ${attribute[0]}`, en: `e.g. ${attribute[1]}` },
});

export const BUSINESS_TYPES: BusinessType[] = [
    {
        id: "clothing",
        label_i18n: { ar: "ملابس وأحذية وجنط", en: "Clothes, shoes & bags" },
        icon: "Shirt",
        pack_id: "fashion",
        industry: /fashion|cloth|أزياء/i,
        examples: examples(["قميص قطن أبيض", "White cotton shirt"], ["قمصان، بناطيل", "Shirts, trousers"], "shirts", ["القماش", "Fabric"]),
        presets: [LETTER_SIZES, SHOE_SIZES, COLOURS],
        template: CLOTHING_TEMPLATE,
    },
    {
        id: "perfume",
        label_i18n: { ar: "عطور", en: "Perfume" },
        icon: "SprayCan",
        pack_id: "perfume",
        industry: /beauty|cosmetic|جمال/i,
        examples: examples(["عطر عود 100 مل", "Oud perfume 100 ml"], ["عطور رجالية، عطور نسائية", "Men's, women's"], "perfumes", ["العائلة العطرية", "Scent family"]),
        presets: [VOLUME_ML],
    },
    {
        id: "beauty",
        label_i18n: { ar: "مكياج وعناية", en: "Makeup & skincare" },
        icon: "Sparkles",
        pack_id: "beauty",
        industry: /beauty|cosmetic|جمال/i,
        examples: examples(["سيروم فيتامين سي 30 مل", "Vitamin C serum 30 ml"], ["عناية بالبشرة، مكياج", "Skincare, makeup"], "skincare", ["نوع البشرة", "Skin type"]),
        presets: [VOLUME_ML],
    },
    {
        id: "electronics",
        label_i18n: { ar: "موبايلات وإلكترونيات", en: "Phones & electronics" },
        icon: "Smartphone",
        pack_id: "electronics",
        industry: /electronic|إلكترون/i,
        examples: examples(["سماعة بلوتوث لاسلكية", "Wireless Bluetooth earbuds"], ["سماعات، شواحن", "Headphones, chargers"], "headphones", ["الضمان", "Warranty"]),
        presets: [STORAGE, COLOURS],
        template: ELECTRONICS_TEMPLATE,
    },
    {
        id: "home",
        label_i18n: { ar: "أثاث وأدوات منزلية", en: "Furniture & home" },
        icon: "Sofa",
        pack_id: "general",
        industry: /home|furniture|أثاث/i,
        examples: examples(["طاولة قهوة خشب", "Wooden coffee table"], ["غرف نوم، مطبخ", "Bedroom, kitchen"], "kitchen", ["الأبعاد", "Dimensions"]),
        presets: [ITEM_SIZES, COLOURS],
        template: FURNITURE_TEMPLATE,
    },
    {
        id: "car",
        label_i18n: { ar: "إكسسوارات سيارات", en: "Car accessories" },
        icon: "Car",
        pack_id: "general",
        industry: /automotive|car|سيارات/i,
        examples: examples(["غطاء مقاعد جلد", "Leather seat covers"], ["إكسسوارات داخلية، إضاءة", "Interior, lighting"], "interior", ["يناسب السيارة", "Fits car"]),
        presets: [COLOURS],
        template: CAR_TEMPLATE,
    },
    {
        id: "toys",
        label_i18n: { ar: "ألعاب وأطفال", en: "Toys & kids" },
        icon: "Baby",
        pack_id: "general",
        industry: /kid|baby|toy|أطفال/i,
        examples: examples(["مكعبات بناء 100 قطعة", "Building blocks, 100 pieces"], ["ألعاب تعليمية، دمى", "Learning toys, dolls"], "learning-toys", ["العمر", "Age"]),
        presets: [COLOURS],
        template: TOYS_TEMPLATE,
    },
    {
        id: "books",
        label_i18n: { ar: "كتب وقرطاسية", en: "Books & stationery" },
        icon: "BookOpen",
        pack_id: "general",
        industry: /book|كتب/i,
        examples: examples(["رواية بغلاف فاخر", "Hardcover novel"], ["روايات، كتب أطفال", "Novels, children's books"], "novels", ["المؤلف", "Author"]),
        presets: [],
        template: BOOKS_TEMPLATE,
    },
    {
        id: "accessories",
        label_i18n: { ar: "ساعات وإكسسوارات", en: "Watches & accessories" },
        icon: "Watch",
        pack_id: "general",
        industry: /jewel|accessor|مجوهرات/i,
        examples: examples(["ساعة يد ستانلس", "Stainless steel watch"], ["ساعات، أساور", "Watches, bracelets"], "watches", ["الخامة", "Material"]),
        presets: [METAL_COLOURS, COLOURS],
    },
    {
        id: "food",
        label_i18n: { ar: "أكل وقهوة وحلويات", en: "Food, coffee & sweets" },
        icon: "UtensilsCrossed",
        pack_id: "food",
        industry: /food|beverage|طعام/i,
        examples: examples(["قهوة عربية 500 غم", "Arabic coffee 500 g"], ["قهوة، حلويات", "Coffee, sweets"], "coffee", ["الوزن", "Weight"]),
        presets: [WEIGHT],
    },
    {
        id: "other",
        label_i18n: { ar: "شي ثاني", en: "Something else" },
        icon: "Package",
        pack_id: "general",
        industry: /^other$|أخرى/i,
        presets: [LETTER_SIZES, COLOURS],
    },
];

const BY_ID = new Map(BUSINESS_TYPES.map((t) => [t.id, t]));

export function isBusinessTypeId(value: string): value is BusinessTypeId {
    return BY_ID.has(value as BusinessTypeId);
}

/** The known types in the order the store ticked them; unknown values dropped. */
export function businessTypesOf(ids: readonly string[] | null | undefined): BusinessType[] {
    const seen = new Set<string>();
    const out: BusinessType[] = [];
    for (const id of ids ?? []) {
        const type = isBusinessTypeId(id) ? BY_ID.get(id) : undefined;
        if (type && !seen.has(id)) {
            seen.add(id);
            out.push(type);
        }
    }
    return out;
}

/** The content pack a store starts with: its first type's, else the neutral one. */
export function packIdFor(ids: readonly string[] | null | undefined): string | undefined {
    return businessTypesOf(ids)[0]?.pack_id;
}

/** The first ticked type's examples, or none (the forms keep neutral words). */
export function examplesFor(ids: readonly string[] | null | undefined): BusinessExamples | undefined {
    return businessTypesOf(ids).find((t) => t.examples)?.examples;
}

/** A placeholder in the merchant's language, or the form's own wording. */
export function examplePlaceholder(
    ids: readonly string[] | null | undefined,
    field: "product_i18n" | "category_i18n" | "category_slug_i18n" | "attribute_i18n",
    locale: LocaleCode,
    fallback: string,
): string {
    const found = examplesFor(ids)?.[field];
    return found ? resolveI18n(found, locale) || fallback : fallback;
}

/**
 * The presets the variant builder offers: every ticked type's, without
 * repeats. A store that ticked nothing gets the generic sizes and colours.
 */
export function variantPresetsFor(ids: readonly string[] | null | undefined): VariantPreset[] {
    const types = businessTypesOf(ids);
    const source = types.length > 0 ? types.flatMap((t) => t.presets) : [LETTER_SIZES, COLOURS];
    const byId = new Map<string, VariantPreset>();
    for (const preset of source) if (!byId.has(preset.id)) byId.set(preset.id, preset);
    return [...byId.values()];
}

/** The ready sets for the ticked types, first-ticked first. */
export function attributeTemplatesFor(ids: readonly string[] | null | undefined): AttributeTemplate[] {
    const byId = new Map<string, AttributeTemplate>();
    for (const type of businessTypesOf(ids)) {
        if (type.template && !byId.has(type.template.id)) byId.set(type.template.id, type.template);
    }
    return [...byId.values()];
}

/**
 * Attribute definitions to seed: the pack's first, then each template's
 * attributes whose key is not taken yet (the table is unique on key).
 */
export function mergeAttributeSets(...sets: PackAttribute[][]): PackAttribute[] {
    const seen = new Set<string>();
    const out: PackAttribute[] = [];
    for (const attribute of sets.flat()) {
        if (seen.has(attribute.key)) continue;
        seen.add(attribute.key);
        out.push(attribute);
    }
    return out;
}

/** The wizard industry row that fits the first ticked type. */
export function industryIdFor<T extends { id: string; name: string; name_ar: string | null }>(
    ids: readonly string[] | null | undefined,
    industries: readonly T[],
): string | null {
    const first = businessTypesOf(ids)[0];
    if (!first) return null;
    const row = industries.find((i) => first.industry.test(i.name) || (i.name_ar ? first.industry.test(i.name_ar) : false));
    return row?.id ?? null;
}
