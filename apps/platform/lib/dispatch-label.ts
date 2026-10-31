/**
 * "Dispatch" shipping label, 80 x 120 mm, for thermal printers.
 *
 * Built for the courier's two-second read: destination city in a reversed
 * band, an Arabic fragile-glass tape, the customer card (name, main phone,
 * backup phone) beside the cash box, then the address and a full-width
 * barcode. Black only: a thermal head cannot print grey.
 *
 * Every piece of order text is escaped: the label is written into a
 * same-origin print window, so raw customer input would run as page markup.
 */
import type { Order } from "@/lib/supabase";
import { getBaseOrderId } from "@/lib/utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { computeCodAmount, computeRefundPayout, courierAmount } from "@/lib/order-money";
import { code128Svg, qrSvg } from "@/lib/print-codes";
import { escapeHtml } from "@/lib/html-escape";
import { SCHNEIDERS_LOGO_SVG } from "@/lib/label-brand";

const WARNING_SIGN = `<svg viewBox="0 0 24 22" class="dl-ico" aria-hidden="true"><path d="M12 1.2 23 20.8H1z" fill="#000"/><path d="M12 4.6 19.9 18.8H4.1z" fill="#fff"/><rect x="10.7" y="8.4" width="2.6" height="6" rx=".6" fill="#000"/><rect x="10.7" y="15.6" width="2.6" height="2.4" rx=".6" fill="#000"/></svg>`;
const GLASS_SIGN = `<svg viewBox="0 0 20 24" class="dl-ico" aria-hidden="true"><path d="M3 1h14l-.6 6.2c-.4 4-3 6.4-6.4 6.6-3.4-.2-6-2.6-6.4-6.6z" fill="#000"/><path d="M10.6 1.6 8.8 5.4l2.4 1.6-2 4.2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/><rect x="9" y="13.4" width="2" height="7" fill="#000"/><rect x="5" y="20.4" width="10" height="2.2" rx=".8" fill="#000"/></svg>`;
const PHONE_SIGN = `<svg viewBox="0 0 24 24" class="dl-pi" aria-hidden="true"><path d="M6.6 2.5 9.4 2l1.6 4.6-2.2 1.5a11 11 0 0 0 7.1 7.1l1.5-2.2L22 14.6l-.5 2.8c-.2 1.1-1.2 1.9-2.3 1.8C10.6 18.6 5.4 13.4 4.8 4.8c-.1-1.1.7-2.1 1.8-2.3z" fill="#000"/></svg>`;

/** Iraqi mobile numbers as 0782 700 8326; anything else is left as digits. */
export function formatLabelPhone(phone: string | null | undefined): string {
    if (!phone) return "";
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("964")) digits = "0" + digits.slice(3);
    if (digits.length === 10 && digits.startsWith("7")) digits = "0" + digits;
    if (digits.length === 11 && digits.startsWith("07")) {
        return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    return digits;
}

/** Order time in Baghdad as 30.10.2026 08:46. */
export function formatLabelDate(iso: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baghdad",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

const amountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** What the courier does with cash at the door, and how much. */
export function labelCash(order: Order): { label: string; amount: number } {
    if (order.is_return) return { label: "ادفع للزبون", amount: computeRefundPayout(order) };
    if (order.is_replacement) {
        const signed = courierAmount(order);
        return { label: signed >= 0 ? "استلم نقداً" : "ادفع للزبون", amount: Math.abs(signed) };
    }
    const amount = computeCodAmount(order);
    return { label: amount === 0 ? "مدفوع مسبقاً" : "استلم نقداً", amount };
}

const DENSE_NAME_CHARS = 24;
const DENSE_ADDRESS_CHARS = 70;

export function generateDispatchLabelHTML(order: Order, options: { showBarcode: boolean }): string {
    const id = getBaseOrderId(order.order_id);
    const cash = labelCash(order);
    const items = mergeOrderItems(order.items);
    const itemsText = items.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join("، ") || "—";
    const pieces = items.reduce((sum, i) => sum + i.quantity, 0);
    const e = (value: string | null | undefined) => escapeHtml(value ?? "");

    const banner = order.is_return
        ? `<div class="dl-banner">استرجاع مبلغ — لا تستلم مبلغاً من الزبون</div>`
        : order.is_replacement
          ? `<div class="dl-banner">استبدال — استلم المنتج القديم من الزبون</div>`
          : "";
    // Long orders switch to a tighter type scale so the barcode always keeps its full space.
    const dense =
        Boolean(order.notes) ||
        banner !== "" ||
        (order.customer_name ?? "").length > DENSE_NAME_CHARS ||
        (order.address_details ?? "").length > DENSE_ADDRESS_CHARS;

    return `
<div class="dispatch-label${dense ? " dl-dense" : ""}" dir="rtl">
    <div class="dl-top">
        <div class="dl-brand">${SCHNEIDERS_LOGO_SVG}<div>SCHNEIDERS<small>Perfumes · شنايدر</small></div></div>
        <div class="dl-ref"><span class="dl-oid">#${e(id)}</span>${qrSvg(id, { moduleSteps: 2, maxSizeMm: 13 })}</div>
    </div>
    <div class="dl-dest"><b>${e(order.city) || "—"}</b></div>
    <div class="dl-tape"><div class="dl-tape-in">${WARNING_SIGN}<span>زجاج · قابل للكسر · يُحمل بعناية</span>${GLASS_SIGN}</div></div>
    ${banner}
    <div class="dl-cust">
        <div class="dl-who">
            <div class="dl-nm"><div class="dl-k">اسم الزبون</div><div class="dl-name">${e(order.customer_name)}</div></div>
            <div class="dl-tel dl-main"><span class="dl-lb">${PHONE_SIGN}<span class="dl-k">الهاتف</span></span><span class="dl-num">${e(formatLabelPhone(order.phone))}</span></div>
            ${order.secondary_phone ? `<div class="dl-tel dl-alt"><span class="dl-lb"><span class="dl-k">احتياط</span></span><span class="dl-num">${e(formatLabelPhone(order.secondary_phone))}</span></div>` : ""}
        </div>
        <div class="dl-cod"><div class="dl-k">${cash.label}</div><div class="dl-v">${amountFormat.format(cash.amount)}</div><div class="dl-c">دينار عراقي</div></div>
    </div>
    <div class="dl-addr${order.notes ? " dl-addr-short" : ""}"><div class="dl-k">العنوان</div><div class="dl-addr-t">${e(order.address_details) || "—"}</div></div>
    ${order.notes ? `<div class="dl-notes"><b>ملاحظة:</b> ${e(order.notes)}</div>` : ""}
    <div class="dl-row"><span class="dl-items">${e(itemsText)}</span><span>القطع: ${pieces}</span><span class="dl-date">${formatLabelDate(order.created_at)}</span></div>
    ${options.showBarcode ? `<div class="dl-foot"><div class="dl-bc">${code128Svg(id, { heightMm: dense ? 11 : 14, maxWidthMm: 72 })}<div class="dl-bc-t">${e(id)}</div></div></div>` : ""}
</div>`;
}

export const DISPATCH_LABEL_FONTS = "family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Mono:wght@500;700";

export const DISPATCH_LABEL_CSS = `
    .dispatch-label {
        width: 80mm; height: 120mm; padding: 3mm; overflow: hidden; box-sizing: border-box;
        display: flex; flex-direction: column; gap: 2mm;
        background: #fff; color: #000; direction: rtl;
        font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
    }
    .dispatch-label svg { display: block; }
    .dispatch-label > * { flex-shrink: 0; }
    .dispatch-label > .dl-addr { flex-shrink: 1; min-height: 0; overflow: hidden; }
    .dl-top { display: flex; align-items: center; justify-content: space-between; border-bottom: .6mm solid #000; padding-bottom: 1.6mm; }
    .dl-brand { display: flex; align-items: center; gap: 1.6mm; font-weight: 700; font-size: 9pt; letter-spacing: .2pt; }
    .dl-brand svg { width: 6mm; height: 6mm; }
    .dl-brand small { display: block; font-weight: 400; font-size: 6.5pt; }
    .dl-ref { display: flex; align-items: center; gap: 2mm; }
    .dl-oid { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 11pt; direction: ltr; unicode-bidi: isolate; }
    .dl-dest { background: #000; color: #fff; padding: 2.4mm 3mm; }
    .dl-dest b { display: block; font-size: 27pt; line-height: 1; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dl-tape { display: flex; align-items: center; justify-content: center; height: 8.4mm; margin-top: -1mm;
        background: repeating-linear-gradient(-45deg, #000 0 1.5mm, #fff 1.5mm 3mm); border-bottom: .5mm solid #000;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .dl-tape-in { background: #fff; display: flex; align-items: center; gap: 1.6mm; padding: 0 2.2mm; height: 6.8mm; border: .4mm solid #000; font-weight: 700; font-size: 9pt; }
    .dl-ico { height: 5.4mm; width: auto; }
    .dl-banner { border: .6mm solid #000; text-align: center; font-weight: 700; font-size: 9.5pt; padding: 1mm; }
    .dl-cust { display: grid; grid-template-columns: minmax(0, 1fr) 23mm; gap: 2mm; }
    .dl-who { border: .4mm solid #000; display: flex; flex-direction: column; min-width: 0; }
    .dl-nm { padding: 1.2mm 2mm 1.4mm; border-bottom: .4mm solid #000; }
    .dl-k { font-size: 6.8pt; font-weight: 600; line-height: 1.2; }
    .dl-name { font-size: 14.5pt; font-weight: 700; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .dl-tel { display: flex; align-items: center; justify-content: space-between; gap: 1.5mm; padding: 1mm 2mm; }
    .dl-tel + .dl-tel { border-top: .3mm dashed #000; }
    .dl-pi { width: 3.4mm; height: 3.4mm; flex-shrink: 0; }
    .dl-lb { display: flex; align-items: center; gap: 1.2mm; }
    .dl-num { font-family: 'IBM Plex Mono', monospace; font-weight: 700; direction: ltr; unicode-bidi: isolate; white-space: nowrap; letter-spacing: -.2pt; }
    .dl-main .dl-num { font-size: 12.5pt; }
    .dl-alt .dl-num { font-size: 10pt; font-weight: 500; }
    .dl-cod { background: #000; color: #fff; padding: 1.6mm 1mm; display: flex; flex-direction: column; justify-content: center; text-align: center; gap: .6mm;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .dl-cod .dl-k { font-size: 7.5pt; font-weight: 700; }
    .dl-v { font-family: 'IBM Plex Mono', monospace; font-size: 15pt; font-weight: 700; line-height: 1.05; direction: ltr; }
    .dl-c { font-size: 7pt; font-weight: 600; }
    .dl-addr-t { font-size: 10.5pt; font-weight: 600; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
    .dl-addr-short .dl-addr-t { -webkit-line-clamp: 2; }
    .dl-dense { gap: 1mm; }
    .dl-dense .dl-top { padding-bottom: 1mm; }
    .dl-dense .dl-dest { padding: 1.6mm 3mm; }
    .dl-dense .dl-dest b { font-size: 22pt; }
    .dl-dense .dl-name { font-size: 12pt; }
    .dl-dense .dl-tape { height: 6.6mm; margin-top: -.6mm; }
    .dl-dense .dl-tape-in { height: 5.4mm; font-size: 8pt; }
    .dl-dense .dl-ico { height: 4.2mm; }
    .dl-dense .dl-banner { padding: .3mm 1mm; font-size: 8.5pt; }
    .dl-dense .dl-tel { padding: .6mm 2mm; }
    .dl-dense .dl-addr { display: flex; align-items: baseline; gap: 1.4mm; }
    .dl-dense .dl-addr .dl-k { flex-shrink: 0; }
    .dl-dense .dl-addr-t { font-size: 9pt; line-height: 1.3; min-width: 0; }
    .dl-dense .dl-notes { padding: .5mm 1.6mm; font-size: 8pt; }
    .dl-dense .dl-row { padding: .8mm 0; }
    .dl-dense .dl-bc-t { font-size: 9pt; margin-top: .4mm; }
    .dl-notes { border: .3mm solid #000; padding: .8mm 1.6mm; font-size: 8.5pt; font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .dl-row { display: flex; justify-content: space-between; gap: 2mm; font-size: 8pt; font-weight: 600; border-top: .3mm solid #000; border-bottom: .3mm solid #000; padding: 1.2mm 0; }
    .dl-items { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dl-row > span:not(.dl-items) { white-space: nowrap; }
    .dl-date { font-family: 'IBM Plex Mono', monospace; direction: ltr; unicode-bidi: isolate; }
    .dl-foot { margin-top: auto; display: flex; justify-content: center; }
    .dl-bc { text-align: center; }
    .dl-bc-t { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 10pt; letter-spacing: 2pt; margin-top: .8mm; direction: ltr; }
`;
