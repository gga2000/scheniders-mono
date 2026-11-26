import { z } from "zod";
import {
  CUSTOM_FIELD_TOKENS_AR,
  CUSTOM_TEMPLATE_BUTTONS,
  CUSTOM_TEMPLATE_LANGUAGE,
  customTemplateSubmitCategory,
  customTemplateVariables,
  numberedTemplateBody,
  type CustomTemplateField,
  type CustomTemplatePurpose,
} from "@scheniders/shared/whatsapp-custom-templates";

/**
 * Shops' paid custom WhatsApp messages (migration
 * 20261126133000_custom_whatsapp_templates) as the staff console reads them,
 * and what staff type into Interakt for one. Staff submit each by hand: copy
 * it in, mark it sent to Meta, then approved (with the category Meta chose)
 * or rejected with the reason the shop reads, which refunds the shop.
 */

export const CUSTOM_WA_QUEUE_KEY = ["admin", "custom-whatsapp"] as const;

export const CUSTOM_WA_STATUSES = ["review", "at_meta", "live", "rejected", "declined", "withdrawn", "replaced"] as const;

export const customWaItemSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  purpose: z.enum(["confirmation", "reminder", "discount"]),
  body: z.string(),
  template_name: z.string(),
  status: z.enum(CUSTOM_WA_STATUSES),
  category: z.enum(["utility", "marketing"]).nullable(),
  price_iqd: z.number(),
  reason: z.string().nullable(),
  created_at: z.string(),
  sent_to_meta_at: z.string().nullable(),
  decided_at: z.string().nullable(),
  refunded_at: z.string().nullable(),
  tenant: z.object({ business_name: z.string().nullable(), display_id: z.number().nullable() }).nullable(),
});
export type CustomWaItem = z.infer<typeof customWaItemSchema>;

export const customWaQueueSchema = z.object({
  items: z.array(customWaItemSchema),
  /** Where Interakt can fetch each message's header picture; null when PLATFORM_URL is not set. */
  header_images: z.record(z.string(), z.string()).nullable(),
});

/** One staff step on a request, as the POST route takes it. */
export const customWaStepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("at_meta") }),
  z.object({ step: z.literal("live"), category: z.enum(["utility", "marketing"]) }),
  z.object({ step: z.literal("rejected"), reason: z.string().trim().min(3).max(500) }),
  z.object({ step: z.literal("declined"), reason: z.string().trim().min(3).max(500) }),
]);
export type CustomWaStep = z.infer<typeof customWaStepSchema>;

/** Each message's header picture in the merchant app (lib/interakt TEMPLATE_HEADER_IMAGES). */
export const CUSTOM_WA_HEADER_PATHS: Record<CustomTemplatePurpose, string> = {
  confirmation: "/whatsapp/order-confirm.png",
  reminder: "/whatsapp/order-reminder.png",
  discount: "/whatsapp/order-discount.png",
};

/** A sample for each field, which Interakt asks for when a template has variables. */
const SAMPLES: Record<CustomTemplateField, string> = {
  customer_name: "علي حسن",
  store_name: "عطور الكرادة",
  order_number: "1042",
  products: "عطر عود × 1",
  address: "بغداد، الكرادة",
  phone: "07701234567",
  total: "35,000 د.ع",
  store_whatsapp: "07801234567",
  discount: "10%",
  discounted_price: "31,500 د.ع",
};

export interface InteraktField {
  label: string;
  value: string;
}

/** What staff fill in on Interakt's new-template form, field by field, in its order. */
export function interaktFields(item: Pick<CustomWaItem, "purpose" | "body" | "template_name">): InteraktField[] {
  const variables = customTemplateVariables(item.body);
  const [first, second] = CUSTOM_TEMPLATE_BUTTONS[item.purpose];
  return [
    { label: "Template name", value: item.template_name },
    { label: "Category", value: customTemplateSubmitCategory(item.purpose) === "marketing" ? "Marketing" : "Utility" },
    { label: "Language", value: CUSTOM_TEMPLATE_LANGUAGE === "ar" ? "Arabic" : CUSTOM_TEMPLATE_LANGUAGE },
    { label: "Header", value: "Image" },
    { label: "Body", value: numberedTemplateBody(item.body) },
    {
      label: "Variable samples",
      value: variables.map((field, i) => `{{${i + 1}}} ${CUSTOM_FIELD_TOKENS_AR[field]}: ${SAMPLES[field]}`).join("\n"),
    },
    { label: "Quick reply buttons", value: `${first}\n${second}` },
  ];
}

/** Open requests first (waiting on us, then on Meta), oldest first within each; then the rest, newest first. */
export function queueOrder(a: CustomWaItem, b: CustomWaItem): number {
  const rank = (s: CustomWaItem["status"]) => (s === "review" ? 0 : s === "at_meta" ? 1 : 2);
  const byRank = rank(a.status) - rank(b.status);
  if (byRank !== 0) return byRank;
  return rank(a.status) < 2 ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at);
}
