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
import { PRIME_LOGO_SVG, SCHNEIDERS_LOGO_SVG } from "@/lib/label-brand";
import type { AfterSalePickup } from "@/lib/after-sale/label-pickups";

const WARNING_SIGN = `<svg viewBox="0 0 24 22" class="dl-ico" aria-hidden="true"><path d="M12 1.2 23 20.8H1z" fill="#000"/><path d="M12 4.6 19.9 18.8H4.1z" fill="#fff"/><rect x="10.7" y="8.4" width="2.6" height="6" rx=".6" fill="#000"/><rect x="10.7" y="15.6" width="2.6" height="2.4" rx=".6" fill="#000"/></svg>`;
const GLASS_SIGN = `<svg viewBox="0 0 20 24" class="dl-ico" aria-hidden="true"><path d="M3 1h14l-.6 6.2c-.4 4-3 6.4-6.4 6.6-3.4-.2-6-2.6-6.4-6.6z" fill="#000"/><path d="M10.6 1.6 8.8 5.4l2.4 1.6-2 4.2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/><rect x="9" y="13.4" width="2" height="7" fill="#000"/><rect x="5" y="20.4" width="10" height="2.2" rx=".8" fill="#000"/></svg>`;
// Arrows point the way the goods move: out of the courier's hands, or back into them.
// A perfume bottle under a "no" circle: the bottle in the box stays sealed.
const NO_OPEN_SIGN = `<svg viewBox="0 0 24 24" class="dl-ico" aria-hidden="true"><rect x="10" y="3.2" width="4" height="3" fill="#000"/><rect x="8.6" y="2" width="6.8" height="1.8" rx=".5" fill="#000"/><rect x="6.6" y="7" width="10.8" height="13" rx="2" fill="#000"/><circle cx="12" cy="12" r="10.6" fill="none" stroke="#000" stroke-width="2.2"/><path d="M4.6 4.6 19.4 19.4" stroke="#fff" stroke-width="3.6"/><path d="M4.6 4.6 19.4 19.4" stroke="#000" stroke-width="2.2"/></svg>`;
const OUT_SIGN = `<svg viewBox="0 0 16 16" class="dl-ai" aria-hidden="true"><path d="M2 8h9.5M8 3.5 12.5 8 8 12.5" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="square"/></svg>`;
const BACK_SIGN = `<svg viewBox="0 0 16 16" class="dl-ai" aria-hidden="true"><path d="M14 8H4.5M8 3.5 3.5 8 8 12.5" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="square"/></svg>`;
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

/** What the courier does with cash at the door. */
export type CashDirection = "collect" | "pay" | "prepaid";

/** What the courier does with cash at the door, and how much (always positive). */
export function doorCash(order: Order): { direction: CashDirection; amount: number } {
    if (order.is_return) return { direction: "pay", amount: computeRefundPayout(order) };
    if (order.is_replacement) {
        const signed = courierAmount(order);
        return { direction: signed >= 0 ? "collect" : "pay", amount: Math.abs(signed) };
    }
    const amount = computeCodAmount(order);
    return { direction: amount === 0 ? "prepaid" : "collect", amount };
}

const CASH_LABEL: Record<CashDirection, string> = {
    collect: "استلم نقداً",
    pay: "ادفع للزبون",
    prepaid: "مدفوع مسبقاً",
};

/** The label's cash box: the instruction in Arabic and the amount. */
export function labelCash(order: Order): { label: string; amount: number } {
    const { direction, amount } = doorCash(order);
    return { label: CASH_LABEL[direction], amount };
}

const DENSE_NAME_CHARS = 24;
const DENSE_ADDRESS_CHARS = 70;

/**
 * The receipt number printed on the label, digits only: the same number the
 * courier file sends (lib/shipping/courier-sheets.ts), so the courier's
 * system and the label agree. RTN-4030-1 / RPL-4030-1 print as 4030.
 */
export function labelReceiptNumber(orderId: string): string {
    const clean = orderId.replace(/^CHK-/, "");
    const afterSale = clean.match(/^(?:RTN|RPL)-(\d+)/);
    return afterSale ? afterSale[1] : getBaseOrderId(clean);
}

export interface DispatchLabelOptions {
    showBarcode: boolean;
    /** Pickup lines of a refund or replacement order, when it has them. */
    pickup?: AfterSalePickup;
    /** Courier logo beside the order number; a custom URL replaces the built-in Prime mark. */
    courierLogo?: { show: boolean; url?: string };
}

const itemList = (items: { name: string; qty: number }[]): string =>
    items.map((i) => `${escapeHtml(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join("، ");

/**
 * The refund / replacement block: what kind of trip this is, what the courier
 * hands over and what they take back. On a refund `order.items` are the items
 * coming back; on a replacement they are the new items going out, and the old
 * ones come from the after-sale pickup lines.
 */
function afterSaleLines(order: Order, items: { name: string; qty: number }[], pickup: AfterSalePickup | undefined): string {
    const isRefund = Boolean(order.is_return);
    const back = pickup ? pickup.items : isRefund ? items : null;
    const backText = back === null ? "المنتج القديم (حسب الطلب الأصلي)" : back.length === 0 ? "لا شيء — الزبون يحتفظ بالمنتج" : itemList(back);
    const lines = isRefund
        ? `<div class="dl-as-l"><span class="dl-as-k">${BACK_SIGN}استلم من الزبون</span><span class="dl-as-v">${backText}</span></div>`
        : `<div class="dl-as-l"><span class="dl-as-k">${OUT_SIGN}سلّم للزبون</span><span class="dl-as-v">${itemList(items) || "—"}</span></div>
        <div class="dl-as-l"><span class="dl-as-k">${BACK_SIGN}استلم منه</span><span class="dl-as-v">${backText}</span></div>`;
    return `<div class="dl-as">${lines}</div>`;
}

/** Every parcel going out to a customer: the perfume stays sealed; the sample in the box is the tester. */
const PERFUME_WARNING = `<div class="dl-perf">${NO_OPEN_SIGN}<div class="dl-perf-t"><b>يمنع فتح العطر منعاً باتاً</b><span>يتم الاختبار حصراً من خلال العينة المرفقة</span></div></div>`;

export function generateDispatchLabelHTML(order: Order, options: DispatchLabelOptions): string {
    const afterSale = Boolean(order.is_return || order.is_replacement);
    const id = labelReceiptNumber(order.order_id);
    const door = doorCash(order);
    const cash = { label: CASH_LABEL[door.direction], amount: door.amount };
    const payOut = door.direction === "pay";
    const items = mergeOrderItems(order.items).map((i) => ({ name: i.name, qty: i.quantity }));
    const pieces = items.reduce((sum, i) => sum + i.qty, 0);
    const e = (value: string | null | undefined) => escapeHtml(value ?? "");
    const courierLogo = !options.courierLogo?.show
        ? ""
        : options.courierLogo.url
          ? `<img class="dl-courier" src="${e(options.courierLogo.url)}" alt="">`
          : `<span class="dl-courier dl-prime" role="img" aria-label="Prime"></span>`;

    const original = options.pickup?.originalOrderNumber;
    const kindPill = afterSale
        ? `<span class="dl-kind"><b>${order.is_return ? "استرجاع" : "استبدال"}</b>${original ? `<small>عن <bdi dir="ltr">#${e(original)}</bdi></small>` : ""}</span>`
        : "";
    // Notes never get cut mid-line: each long block above them takes a line off their clamp.
    const noteLines = Math.max(
        1,
        (afterSale ? 3 : 2) -
            Number((order.customer_name ?? "").length > DENSE_NAME_CHARS) -
            Number((order.address_details ?? "").length > DENSE_ADDRESS_CHARS) -
            Number(Boolean(order.is_replacement)),
    );

    // Long orders switch to a tighter type scale so the barcode always keeps its full space.
    const dense =
        afterSale ||
        Boolean(order.notes) ||
        (order.customer_name ?? "").length > DENSE_NAME_CHARS ||
        (order.address_details ?? "").length > DENSE_ADDRESS_CHARS;

    return `
<div class="dispatch-label${dense ? " dl-dense" : ""}" dir="rtl">
    <div class="dl-top">
        <div class="dl-idc">
            <div class="dl-k">رقم الوصل</div>
            <div class="dl-oid${id.length > 11 ? " dl-oid-long" : id.length > 9 ? " dl-oid-mid" : ""}">${e(id)}</div>
        </div>
        ${courierLogo}
        <div class="dl-qr">${qrSvg(id, { moduleSteps: 3, maxSizeMm: 21 })}</div>
    </div>
    <div class="dl-dest"><b>${e(order.city) || "—"}</b>${kindPill}</div>
    <div class="dl-tape"><div class="dl-tape-in">${WARNING_SIGN}<span>زجاج · قابل للكسر · يُحمل بعناية</span>${GLASS_SIGN}</div></div>
    ${order.is_return ? "" : PERFUME_WARNING}
    ${afterSale ? afterSaleLines(order, items, options.pickup) : ""}
    <div class="dl-cust">
        <div class="dl-who">
            <div class="dl-nm"><div class="dl-k">اسم الزبون</div><div class="dl-name">${e(order.customer_name)}</div></div>
            <div class="dl-tel dl-main"><span class="dl-lb">${PHONE_SIGN}<span class="dl-k">الهاتف</span></span><span class="dl-num">${e(formatLabelPhone(order.phone))}</span></div>
            ${order.secondary_phone ? `<div class="dl-tel dl-alt"><span class="dl-lb"><span class="dl-k">احتياط</span></span><span class="dl-num">${e(formatLabelPhone(order.secondary_phone))}</span></div>` : ""}
        </div>
        <div class="dl-cod${payOut ? " dl-cod-out" : ""}"><div class="dl-k">${cash.label}</div><div class="dl-v">${amountFormat.format(cash.amount)}</div><div class="dl-c">${payOut ? "لا تستلم مبلغاً" : "دينار عراقي"}</div></div>
    </div>
    <div class="dl-addr${order.notes ? " dl-addr-short" : ""}"><div class="dl-k">العنوان</div><div class="dl-addr-t">${e(order.address_details) || "—"}</div></div>
    ${order.notes ? `<div class="dl-notes" style="-webkit-line-clamp: ${noteLines}"><b>${afterSale ? "تعليمات" : "ملاحظة"}:</b> ${e(order.notes)}</div>` : ""}
    ${afterSale ? "" : `<div class="dl-row"><span class="dl-items"><span class="dl-k">المنتج</span> ${itemList(items) || "—"}</span><span class="dl-pcs">${pieces} قطعة</span></div>`}
    ${options.showBarcode ? `<div class="dl-foot"><div class="dl-bc">${code128Svg(id, { heightMm: dense ? 7 : 8, maxWidthMm: 74 })}</div></div>` : ""}
    <div class="dl-meta"><span class="dl-brand">${SCHNEIDERS_LOGO_SVG}SCHNEIDERS</span><span class="dl-date">${formatLabelDate(order.created_at)}</span></div>
</div>`;
}

export const DISPATCH_LABEL_FONTS = "family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Mono:wght@500;700";

export const DISPATCH_LABEL_CSS = `
    .dispatch-label {
        width: 80mm; height: 120mm; padding: 3mm; overflow: hidden; box-sizing: border-box;
        display: flex; flex-direction: column; gap: 2.4mm;
        background: #fff; color: #000; direction: rtl;
        font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
    }
    .dispatch-label svg { display: block; }
    .dispatch-label > * { flex-shrink: 0; }
    /* When a long order still runs out of room, the notes give way first, then the barcode's
       height (a 1D code still scans when shorter); the address and the QR never shrink. */
    .dispatch-label > .dl-foot { flex-shrink: 2; min-height: 5mm; overflow: hidden; align-items: flex-start; }
    .dl-top { display: flex; align-items: flex-end; gap: 3mm; border-bottom: .6mm solid #000; padding-bottom: 1.2mm; }
    .dl-idc { min-width: 0; display: flex; flex-direction: column; gap: .6mm; }
    .dl-idc > .dl-k { font-size: 8pt; font-weight: 700; }
    .dl-oid { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 17pt; line-height: 1; direction: ltr; text-align: right; white-space: nowrap; }
    .dl-oid-mid { font-size: 15pt; }
    .dl-oid-long { font-size: 12pt; }
    .dl-courier { flex-shrink: 1; min-width: 0; height: 7.5mm; width: auto; max-width: 19mm; object-fit: contain; margin-bottom: .4mm; }
    /* The Prime mark is one stylesheet image shared by every label, not a 19 KB path repeated per label. */
    .dl-prime { width: 18.5mm; background: url("data:image/svg+xml,${encodeURIComponent(PRIME_LOGO_SVG)}") center / contain no-repeat;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .dl-qr { flex-shrink: 0; margin-inline-start: auto; }
    .dl-dest { background: #000; color: #fff; padding: 2.4mm 3mm; display: flex; align-items: center; justify-content: space-between; gap: 2mm; }
    .dl-kind { flex-shrink: 0; background: #fff; color: #000; padding: .6mm 2.4mm; display: flex; flex-direction: column; align-items: center; line-height: 1.1;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .dl-kind b { font-size: 13pt; }
    .dl-kind small { font-family: 'IBM Plex Mono', monospace; font-size: 7pt; font-weight: 700; }
    .dl-dest > b { display: block; min-width: 0; font-size: 27pt; line-height: 1; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dl-tape { display: flex; align-items: center; justify-content: center; height: 8.4mm; margin-top: -2.4mm;
        background: repeating-linear-gradient(-45deg, #000 0 1.5mm, #fff 1.5mm 3mm); border-bottom: .5mm solid #000;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .dl-tape-in { background: #fff; display: flex; align-items: center; gap: 1.6mm; padding: 0 2.2mm; height: 6.8mm; border: .4mm solid #000; font-weight: 700; font-size: 9pt; }
    .dl-ico { height: 5.4mm; width: auto; }
    .dl-perf { display: flex; align-items: center; gap: 2mm; padding: .5mm 2mm; border: .7mm solid #000; }
    .dl-perf .dl-ico { height: 6mm; flex-shrink: 0; }
    .dl-perf-t { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
    .dl-perf-t b { font-size: 10pt; }
    .dl-perf-t span { font-size: 8.5pt; font-weight: 700; }
    .dl-as { border: .7mm solid #000; }
    .dl-as-l { display: flex; align-items: baseline; gap: 1.6mm; padding: .5mm 2mm; font-size: 9pt; font-weight: 700; line-height: 1.3; }
    .dl-as-l + .dl-as-l { border-top: .3mm dashed #000; }
    .dl-as-k { flex-shrink: 0; display: flex; align-items: center; gap: 1mm; font-size: 7.5pt; }
    .dl-as-v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dl-ai { width: 3.2mm; height: 3.2mm; }
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
    .dl-cod-out { background: #fff; color: #000; border: .9mm solid #000; }
    .dl-cod-out .dl-k { background: #000; color: #fff; margin: 0 .4mm; padding: .3mm 0; }
    .dl-cod-out .dl-c { font-weight: 700; }
    .dl-addr-t { font-size: 10.5pt; font-weight: 600; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
    .dl-addr-short .dl-addr-t { -webkit-line-clamp: 2; }
    .dl-dense { gap: 1mm; }
    .dl-dense .dl-dest { padding: 1.6mm 3mm; }
    .dl-dense .dl-dest > b { font-size: 22pt; }
    .dl-dense .dl-name { font-size: 12pt; }
    .dl-dense .dl-tape { height: 6.6mm; margin-top: -.6mm; }
    .dl-dense .dl-tape-in { height: 5.4mm; font-size: 8pt; }
    .dl-dense .dl-ico { height: 4.2mm; }
    .dl-dense .dl-perf { padding: .4mm 1.6mm; gap: 1.4mm; }
    .dl-dense .dl-perf .dl-ico { height: 4.6mm; }
    .dl-dense .dl-perf-t { flex-direction: row; flex-wrap: wrap; column-gap: 1.2mm; align-items: baseline; }
    .dl-dense .dl-perf-t b { font-size: 8.5pt; }
    .dl-dense .dl-perf-t span { font-size: 7.5pt; }
    .dl-dense .dl-tel { padding: .6mm 2mm; }
    .dl-dense .dl-addr { display: flex; align-items: baseline; gap: 1.4mm; }
    .dl-dense .dl-addr .dl-k { flex-shrink: 0; }
    .dl-dense .dl-addr-t { font-size: 9pt; line-height: 1.3; min-width: 0; }
    .dl-dense .dl-notes { padding: .5mm 1.6mm; font-size: 8pt; }
    .dl-dense .dl-row { padding: .8mm 0; }
    .dl-notes { border: .3mm solid #000; padding: .8mm 1.6mm; font-size: 8.5pt; font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .dl-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: 10.5pt; font-weight: 700; border-top: .3mm solid #000; border-bottom: .3mm solid #000; padding: 1.2mm 0; }
    .dl-items { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dl-row > span:not(.dl-items) { white-space: nowrap; }
    .dl-items .dl-k { margin-inline-end: 1mm; }
    .dl-pcs { font-size: 8.5pt; }
    .dl-meta { display: flex; justify-content: space-between; align-items: center; font-size: 6.5pt; margin-top: -.6mm; }
    .dl-brand { display: flex; align-items: center; gap: .8mm; font-weight: 700; letter-spacing: .3pt; }
    .dl-brand svg { width: 3mm; height: 3mm; }
    .dl-date { font-family: 'IBM Plex Mono', monospace; font-weight: 500; direction: ltr; }
    .dl-foot { margin-top: auto; display: flex; justify-content: center; }
    .dl-bc { text-align: center; }
`;
