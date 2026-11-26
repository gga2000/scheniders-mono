/**
 * A shop's own wording for one of Fermi's three automatic order messages
 * (paid extra, 15,000 IQD; migration 20261126142528_custom_whatsapp_templates).
 *
 * The body is kept in "key form": the shop's text with fields written as
 * {customer_name}, {store_name}… Interakt wants them numbered {{1}} {{2}}… in
 * the order they appear, so the staff copy (numberedTemplateBody) and the send
 * path (customTemplateVariables) both read that order from the same body, and
 * a field used twice is two numbers, as Meta requires.
 *
 * customTemplateProblem holds the same rules, in the same order, as the
 * database's custom_whatsapp_template_problem, which has the last word.
 */
import { WHATSAPP_TEMPLATES, type OrderTemplateType, type WhatsAppCategory } from "./whatsapp-templates";

export type CustomTemplatePurpose = OrderTemplateType;

export const CUSTOM_TEMPLATE_PURPOSES: readonly CustomTemplatePurpose[] = ["confirmation", "reminder", "discount"];

export const CUSTOM_TEMPLATE_FIELDS = [
    "customer_name",
    "store_name",
    "order_number",
    "products",
    "address",
    "phone",
    "total",
    "store_whatsapp",
    "discount",
    "discounted_price",
] as const;
export type CustomTemplateField = (typeof CUSTOM_TEMPLATE_FIELDS)[number];

const ORDER_FIELDS: readonly CustomTemplateField[] = [
    "customer_name",
    "store_name",
    "order_number",
    "products",
    "address",
    "phone",
    "total",
    "store_whatsapp",
];
const DISCOUNT_FIELDS: readonly CustomTemplateField[] = [...ORDER_FIELDS, "discount", "discounted_price"];

/** The fields a message of this kind can fill. */
export function customTemplateFields(purpose: CustomTemplatePurpose): readonly CustomTemplateField[] {
    return purpose === "discount" ? DISCOUNT_FIELDS : ORDER_FIELDS;
}

/** Meta's body limit, in characters. */
export const CUSTOM_TEMPLATE_MAX_CHARS = 1024;

/** Custom templates are registered in Arabic. */
export const CUSTOM_TEMPLATE_LANGUAGE = "ar" as const;

/**
 * The two quick-reply buttons a custom template carries, word for word, so a
 * customer's tap is read the same as on Fermi's message (lib/interakt-inbound).
 */
export const CUSTOM_TEMPLATE_BUTTONS: Readonly<Record<CustomTemplatePurpose, readonly [string, string]>> = {
    confirmation: ["تأكيد الطلب", "إلغاء الطلب"],
    reminder: ["تأكيد الطلب", "إلغاء الطلب"],
    discount: ["تأكيد بالخصم", "لا شكراً"],
};

/** The category staff submit it under: Fermi's own message's. Meta may change it. */
export function customTemplateSubmitCategory(purpose: CustomTemplatePurpose): WhatsAppCategory {
    return WHATSAPP_TEMPLATES[purpose].category;
}

export type CustomTemplateProblem =
    | "empty"
    | "too_long"
    | "unknown_field"
    | "no_store_name"
    | "link"
    | "field_at_edge";

const FIELD = /\{([a-z_]+)\}/g;
const EDGE_SPACE = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/** The body as the database keeps it: Windows line ends made plain, ends trimmed. */
export function normalizeCustomTemplateBody(body: string): string {
    return body.replace(/\r\n/g, "\n").replace(EDGE_SPACE, "");
}

function isField(purpose: CustomTemplatePurpose, key: string): key is CustomTemplateField {
    return (customTemplateFields(purpose) as readonly string[]).includes(key);
}

/** What is wrong with a shop's text for this message, or null when nothing is. */
export function customTemplateProblem(purpose: CustomTemplatePurpose, body: string): CustomTemplateProblem | null {
    const text = normalizeCustomTemplateBody(body);
    if (text === "") return "empty";
    if ([...text].length > CUSTOM_TEMPLATE_MAX_CHARS) return "too_long";
    for (const match of text.matchAll(FIELD)) {
        if (!isField(purpose, match[1])) return "unknown_field";
    }
    if (/[{}]/.test(text.replace(FIELD, ""))) return "unknown_field";
    if (!text.includes("{store_name}")) return "no_store_name";
    if (/(https?:\/\/|www\.)/i.test(text) || /[a-z0-9_-]+\.[a-z]{2,}/i.test(text)) return "link";
    if (/^\{[a-z_]+\}/.test(text) || /\{[a-z_]+\}$/.test(text)) return "field_at_edge";
    return null;
}

/** The fields in the order Interakt numbers them; a field used twice is listed twice. */
export function customTemplateVariables(body: string): CustomTemplateField[] {
    const fields: CustomTemplateField[] = [];
    for (const match of body.matchAll(FIELD)) {
        const key = match[1];
        if ((CUSTOM_TEMPLATE_FIELDS as readonly string[]).includes(key)) fields.push(key as CustomTemplateField);
    }
    return fields;
}

/** The body as it is typed into Interakt: {{1}}, {{2}}… in order of appearance. */
export function numberedTemplateBody(body: string): string {
    let n = 0;
    return body.replace(FIELD, () => `{{${++n}}}`);
}

/** The body with every field filled, as the customer reads it. */
export function fillCustomTemplate(body: string, values: Readonly<Record<CustomTemplateField, string>>): string {
    return body.replace(FIELD, (whole, key: string) =>
        (CUSTOM_TEMPLATE_FIELDS as readonly string[]).includes(key) ? values[key as CustomTemplateField] : whole,
    );
}

/** A field's name as the shop reads and types it in the editor. */
export type CustomFieldLabels = Readonly<Record<CustomTemplateField, string>>;

/** Key form to the editor's form: {customer_name} becomes {اسم الزبون}. */
export function bodyToLabels(body: string, labels: CustomFieldLabels): string {
    return body.replace(FIELD, (whole, key: string) =>
        (CUSTOM_TEMPLATE_FIELDS as readonly string[]).includes(key) ? `{${labels[key as CustomTemplateField]}}` : whole,
    );
}

/**
 * The editor's form to key form. A {name} that is neither a field's label nor
 * its key is left as typed, so customTemplateProblem reports it.
 */
export function bodyFromLabels(text: string, labels: CustomFieldLabels): string {
    const byLabel = new Map<string, CustomTemplateField>(
        CUSTOM_TEMPLATE_FIELDS.map((key) => [labels[key].trim(), key]),
    );
    return text.replace(/\{([^{}\n]+)\}/g, (whole, inner: string) => {
        const name = inner.trim();
        const key = byLabel.get(name) ?? ((CUSTOM_TEMPLATE_FIELDS as readonly string[]).includes(name) ? name : null);
        return key ? `{${key}}` : whole;
    });
}

/**
 * The tokens the editor shows for each field. The message is Arabic whatever
 * language the app is in, so the tokens are too.
 */
export const CUSTOM_FIELD_TOKENS_AR: CustomFieldLabels = {
    customer_name: "اسم الزبون",
    store_name: "اسم المتجر",
    order_number: "رقم الطلب",
    products: "المنتجات",
    address: "العنوان",
    phone: "رقم الزبون",
    total: "المبلغ",
    store_whatsapp: "واتساب المتجر",
    discount: "نسبة الخصم",
    discounted_price: "السعر بعد الخصم",
};

/**
 * Fermi's own wording of each message in key form (Ali's, 13 Nov; the v3
 * templates in apps/platform/lib/interakt.ts), where a shop's editor starts.
 */
export const FERMI_ORDER_TEMPLATE_BODIES: Readonly<Record<CustomTemplatePurpose, string>> = {
    confirmation: [
        "يا هلا ومرحبا {customer_name} 🌷",
        "وصلنا طلبك من *{store_name}* ✅",
        "",
        "🧾 *تفاصيل طلبك*",
        "🔢 رقم الطلب: {order_number}",
        "🛍️ المنتجات: {products}",
        "📍 العنوان: {address}",
        "📞 الهاتف: {phone}",
        "",
        "💰 *المبلغ الإجمالي: {total}*",
        "",
        "👇 اضغط «تأكيد الطلب» حتى نجهز طلبك ونشحنه.",
        "",
        "ℹ️ هذه رسالة تلقائية من منصة شنايدر لإدارة الطلبات.",
        "💬 للاستفسار تواصل مع متجر *{store_name}* على واتساب {store_whatsapp} وشكراً لثقتك.",
    ].join("\n"),
    reminder: [
        "مرحبا {customer_name} 👋",
        "طلبك من *{store_name}* بعده محجوز باسمك ⏳",
        "",
        "🛍️ المنتجات: {products}",
        "📍 العنوان: {address}",
        "💰 *المبلغ: {total}*",
        "",
        "👇 اضغط «تأكيد الطلب» حتى نشحنه بأقرب وقت.",
        "",
        "ℹ️ هذه رسالة تلقائية من منصة شنايدر لإدارة الطلبات.",
        "💬 للاستفسار تواصل مع متجر *{store_name}* على واتساب {store_whatsapp} وشكراً لثقتك.",
    ].join("\n"),
    discount: [
        "مرحبا {customer_name} 🌟",
        "متجر *{store_name}* حابين يقدمولك خصم إضافي *{discount}* على طلبك 🎁",
        "",
        "🛍️ المنتجات: {products}",
        "💰 السعر الأصلي: {total}",
        "🏷️ *السعر بعد الخصم: {discounted_price}*",
        "",
        "👇 اضغط «تأكيد بالخصم» حتى نجهز طلبك.",
        "",
        "ℹ️ هذه رسالة تلقائية من منصة شنايدر لإدارة الطلبات.",
        "💬 للاستفسار تواصل مع متجر *{store_name}* على واتساب {store_whatsapp} وشكراً لثقتك.",
    ].join("\n"),
};
