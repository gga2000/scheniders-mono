import { NextResponse } from "next/server";
import { z } from "zod";
import { submitCheckout } from "@/app/actions/checkout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const checkoutOrderBodySchema = z.object({
  tenant_id: z.string().uuid(),
  customer_name: z.string().min(1),
  phone: z.string().min(1),
  governorate_code: z.string().min(1),
  city: z.string().min(1),
  address_details: z.string().min(1),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  payment_method: z.enum(["cod", "card", "fastpay"]).optional().default("cod"),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().nullable().default(null),
        name: z.string(),
        variant_name: z.string().nullable().default(null),
        price: z.number(),
        quantity: z.int().min(1),
      }),
    )
    .min(1),
  // accepted and dropped — not forwarded to the order pipeline
  subtotal: z.number().optional(),
  locale: z.string().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "بيانات غير صالحة" },
        { status: 400 },
      );
    }

    const parsed = checkoutOrderBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "بيانات غير صالحة" },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const payload = {
      tenantId: data.tenant_id,
      customer: {
        customer_name: data.customer_name,
        phone: data.phone,
        governorate_code: data.governorate_code,
        city: data.city,
        address_details: data.address_details,
        notes: data.notes,
      },
      items: data.items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        name: i.name,
        variant_name: i.variant_name,
        price: i.price,
        quantity: i.quantity,
      })),
    };

    const result = await submitCheckout(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (e) {
    console.error("[api/checkout/orders]", e);
    return NextResponse.json(
      { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
