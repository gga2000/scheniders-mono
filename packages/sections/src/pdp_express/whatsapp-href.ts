// The express WhatsApp order link. The shared model builds `waHref` from
// the classic form, which has no landmark field; express owns the landmark
// (it is posted as an address suffix), so the WhatsApp message has to
// carry it too or the shop gets a different address on WhatsApp than on
// the order. Same tenant number, same message builder and the same inputs
// as the model's link — only the address line gains " - <landmark>".

import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { formatPrice } from "../helpers/format";
import { resolveTenantWhatsapp, whatsappCartLink } from "../helpers/whatsapp";
import type { ExpressModel } from "./model";

/** The address as the order posts it: "<address> - <landmark>" once a
 *  landmark is typed, the address alone otherwise. */
export function addressWithLandmark(address: string, landmark: string): string {
  const lm = landmark.trim();
  if (!lm) return address;
  return [address.trim(), lm].filter(Boolean).join(" - ");
}

export function expressWhatsappHref(
  m: Pick<ExpressModel, "waHref" | "ctx" | "product" | "qty" | "form" | "total" | "locale">,
  landmark: string,
): string | null {
  // The model's link already encodes "WhatsApp is on and the tenant has a
  // usable number"; without a landmark it is exactly the right link.
  if (m.waHref === null || landmark.trim() === "") return m.waHref;

  const governorate = IRAQ_GOVERNORATES.find((g) => g.code === m.form.governorate_code);
  const address = addressWithLandmark(m.form.address_details, landmark);
  return whatsappCartLink(
    resolveTenantWhatsapp(m.ctx.tenant),
    {
      items: [{ name: m.product.name, quantity: m.qty }],
      customer: {
        name: m.form.customer_name || undefined,
        phone: m.form.phone || undefined,
        governorate: governorate
          ? m.locale !== "en"
            ? governorate.name
            : governorate.name_en
          : undefined,
        address: address || undefined,
      },
      total: formatPrice(m.total, m.locale),
    },
    m.locale,
  );
}
