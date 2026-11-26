/**
 * Every WhatsApp template the platform sends, in one place: the one approved
 * name for each purpose, the Meta category it is priced under, and the
 * language it was registered with in Interakt (Interakt finds a template by
 * name + language). Send paths read this and nothing else.
 *
 * `whatsapp_logs.template_name` keeps the name a message went out as, so a
 * reader that asks "was the confirmation sent?" must accept the old names too,
 * not only today's (the *_TEMPLATE_NAMES lists below).
 */
export type WhatsAppCategory = "utility" | "marketing";

export interface WhatsAppTemplate {
    name: string;
    category: WhatsAppCategory;
    language: "ar" | "en";
}

export const WHATSAPP_TEMPLATES = {
    confirmation: { name: "cod_order_confirm_v3", category: "utility", language: "ar" },
    /** Arabic text, but registered and approved as English. */
    reminder: { name: "order_reminder_v3", category: "utility", language: "en" },
    discount: { name: "order_discount_offer_v3", category: "marketing", language: "ar" },
    /**
     * The failed-delivery warning (lib/prime/failed-notice). Still the copy Ali
     * made in Interakt; it moves to a v3 name once Ali registers one.
     */
    deliveryUpdate: { name: "copy_of_delivery_update", category: "utility", language: "ar" },
    /** New-order alert to the shop's own staff numbers. */
    staffAlert: { name: "new_order_alert_staff", category: "utility", language: "ar" },
    /** The nudge to a shopper who left items in the cart (lib/abandoned-cart-sender). */
    cartRecovery: { name: "abandoned_cart_recovery", category: "marketing", language: "ar" },
} as const satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppPurpose = keyof typeof WHATSAPP_TEMPLATES;

/** The three order templates the dispatcher and the order card send. */
export const ORDER_TEMPLATES = {
    confirmation: WHATSAPP_TEMPLATES.confirmation.name,
    reminder: WHATSAPP_TEMPLATES.reminder.name,
    discount: WHATSAPP_TEMPLATES.discount.name,
} as const;

export type OrderTemplateType = keyof typeof ORDER_TEMPLATES;

/** Oldest first; the last entry is the one sent today. */
export const CONFIRMATION_TEMPLATE_NAMES: readonly string[] = [
    "cod_order_confirm",
    "new_cod_order_confirm",
    ORDER_TEMPLATES.confirmation,
];

export const REMINDER_TEMPLATE_NAMES: readonly string[] = [
    "order_reminder",
    "v2_order_reminder",
    ORDER_TEMPLATES.reminder,
];

export const DISCOUNT_TEMPLATE_NAMES: readonly string[] = [
    "order_discount_offer",
    "v2order_discount_offer",
    ORDER_TEMPLATES.discount,
];

/**
 * A shop's own paid wording for an order message is a template of its own:
 * custom_<purpose>_<shop number>_<n> (whatsapp-custom-templates.ts). It is
 * logged under that name and counts as the message it replaces.
 */
const CUSTOM_TEMPLATE_NAME = /^custom_(confirmation|reminder|discount)_\d+_\d+$/;

/** Which order message a shop's custom template replaces, or null for any other name. */
export function customTemplatePurposeOf(templateName: string | null | undefined): OrderTemplateType | null {
    const match = templateName ? CUSTOM_TEMPLATE_NAME.exec(templateName) : null;
    return match ? (match[1] as OrderTemplateType) : null;
}

/** Names a shop's custom confirmation is logged under start with this (for a LIKE). */
export const CUSTOM_CONFIRMATION_NAME_PREFIX = "custom_confirmation_";

/** What a logged message was for, from any name it was ever sent under. */
export function whatsappPurposeOf(templateName: string | null | undefined): WhatsAppPurpose | "other" {
    if (!templateName) return "other";
    const custom = customTemplatePurposeOf(templateName);
    if (custom) return custom;
    if (CONFIRMATION_TEMPLATE_NAMES.includes(templateName)) return "confirmation";
    if (REMINDER_TEMPLATE_NAMES.includes(templateName)) return "reminder";
    if (DISCOUNT_TEMPLATE_NAMES.includes(templateName)) return "discount";
    if (templateName === WHATSAPP_TEMPLATES.deliveryUpdate.name) return "deliveryUpdate";
    if (templateName === WHATSAPP_TEMPLATES.staffAlert.name) return "staffAlert";
    if (templateName === WHATSAPP_TEMPLATES.cartRecovery.name) return "cartRecovery";
    return "other";
}

export interface PlatformWhatsAppTemplate {
    name: string;
    category: "authentication" | "utility";
    language: "ar" | "en";
}

/**
 * Templates Fermi sends as itself, not for a shop (Fermi B11): to a new
 * owner at signup. No shop pays them, so they never go in whatsapp_logs (which
 * charges the shop's wallet and counts in its trial); signup_phone_codes keeps
 * their message ids. Each is off until staff switch it on in the console's
 * Settings, after Interakt approves it under exactly this name and language.
 */
export const PLATFORM_WHATSAPP_TEMPLATES = {
    /** Meta authentication template: the code in the body and on its copy-code button. */
    signupCode: { name: "signup_code_v1", category: "authentication", language: "ar" },
    /** {{1}} the store's name, {{2}} its link, {{3}} the short how-to video. */
    welcome: { name: "merchant_welcome_v1", category: "utility", language: "ar" },
} as const satisfies Record<string, PlatformWhatsAppTemplate>;
