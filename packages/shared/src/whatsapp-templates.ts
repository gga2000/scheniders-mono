/**
 * The Interakt order templates the platform sends, and every name each one
 * has been sent under. `whatsapp_logs.template_name` keeps the name a message
 * went out as, so a reader that asks "was the confirmation sent?" must accept
 * the old names too, not only today's.
 */
export const ORDER_TEMPLATES = {
    confirmation: "cod_order_confirm_v3",
    reminder: "order_reminder_v3",
    discount: "order_discount_offer_v3",
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
