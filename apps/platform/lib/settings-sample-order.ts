import type { Order } from "@/lib/supabase";

/**
 * The made-up order Settings fills its previews with (WhatsApp messages, the
 * label, checkout). It is never saved or sent; every preview says so.
 */
export const SETTINGS_SAMPLE_ORDER: Order = {
    id: "settings-sample-order",
    created_at: "2026-11-26T09:41:00+03:00",
    order_id: "4821",
    sequence_number: 4821,
    customer_name: "أحمد علي",
    phone: "07701234567",
    city: "البصرة",
    governorate_code: "BA",
    address_details: "حي الجزائر، قرب جامع الرحمن",
    items: [{ name: "عطر ليالي 100 مل", quantity: 1, price: 32000 }],
    price: 32000,
    delivery_fee: 6000,
    status: "new",
    priority: "normal",
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    is_archived: false,
};

/** The offer percent the message preview uses when a template mentions a discount. */
export const SETTINGS_SAMPLE_DISCOUNT_PERCENT = 10;
