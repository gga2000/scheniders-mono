/**
 * The shop's monthly invoice: one printed page (Arabic, right to left, which
 * printed documents may use) built only from the wallet history, so it always
 * matches what the shop was actually charged.
 */
import { escapeHtml } from "@/lib/html-escape";

/** The wallet rows an invoice reads. */
export interface InvoiceTransaction {
    type: string;
    amount_iqd: number;
    balance_after_iqd: number;
    description: string | null;
    reference_id: string | null;
    payment_method: string | null;
    created_at: string;
}

export type InvoiceLineKind = "monthly" | "delivered" | "whatsappConfirm" | "whatsappOffer" | "whatsapp" | "orderCharge" | "other";

export interface InvoiceLine {
    kind: InvoiceLineKind;
    count: number;
    /** What the shop paid for this kind, as a positive number. */
    total: number;
}

export interface InvoiceTopup {
    at: string;
    amount: number;
    method: string | null;
}

export interface MonthlyInvoice {
    /** "2026-11" */
    month: string;
    number: string;
    storeName: string;
    displayId: number | null;
    lines: InvoiceLine[];
    charged: number;
    topups: InvoiceTopup[];
    /** Credits that are not top-ups, such as an admin correction. */
    otherCredits: number;
    openingBalance: number;
    closingBalance: number;
}

/** Baghdad is UTC+3 all year (no daylight saving). */
const BAGHDAD_OFFSET = "+03:00";

/** The month that contains `date`, in Baghdad time, as "YYYY-MM". */
export function baghdadMonth(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit" }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}`;
}

/** [start, end) of a "YYYY-MM" month in Baghdad time, as ISO instants. */
export function monthRange(month: string): { start: string; end: string } {
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return {
        start: new Date(`${month}-01T00:00:00${BAGHDAD_OFFSET}`).toISOString(),
        end: new Date(`${next}-01T00:00:00${BAGHDAD_OFFSET}`).toISOString(),
    };
}

/** The last `count` months up to and including the one containing `now`, newest first. */
export function recentMonths(now: Date, count: number): string[] {
    const [y, m] = baghdadMonth(now).split("-").map(Number);
    return Array.from({ length: count }, (_, i) => {
        const total = y * 12 + (m - 1) - i;
        return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    });
}

/** Which fee a charge row is, read from the description the billing functions write. */
export function chargeKind(description: string | null): InvoiceLineKind {
    const d = description ?? "";
    if (d.startsWith("Monthly subscription")) return "monthly";
    if (d.startsWith("Delivered order ")) return "delivered";
    if (d.startsWith("WhatsApp confirmation")) return "whatsappConfirm";
    if (d.startsWith("WhatsApp offer")) return "whatsappOffer";
    if (d.startsWith("WhatsApp message")) return "whatsapp";
    if (d === "Order charge") return "orderCharge";
    return "other";
}

const LINE_ORDER: InvoiceLineKind[] = ["monthly", "delivered", "whatsappConfirm", "whatsappOffer", "whatsapp", "orderCharge", "other"];

/**
 * Sums one month of wallet rows. `before` is the shop's balance when the month
 * began (the balance after its last earlier row, 0 for a new wallet).
 */
export function buildMonthlyInvoice(input: {
    month: string;
    storeName: string;
    displayId: number | null;
    transactions: readonly InvoiceTransaction[];
    openingBalance: number;
}): MonthlyInvoice {
    const rows = [...input.transactions].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const byKind = new Map<InvoiceLineKind, InvoiceLine>();
    const topups: InvoiceTopup[] = [];
    let otherCredits = 0;

    for (const tx of rows) {
        const amount = Number(tx.amount_iqd);
        if (tx.type === "topup") {
            topups.push({ at: tx.created_at, amount, method: tx.payment_method });
        } else if (amount < 0) {
            const kind = chargeKind(tx.description);
            const line = byKind.get(kind) ?? { kind, count: 0, total: 0 };
            line.count += 1;
            line.total += -amount;
            byKind.set(kind, line);
        } else {
            otherCredits += amount;
        }
    }

    const lines = LINE_ORDER.flatMap((k) => byKind.get(k) ?? []);
    const last = rows.at(-1);
    return {
        month: input.month,
        number: `${input.displayId ?? "0"}-${input.month}`,
        storeName: input.storeName,
        displayId: input.displayId,
        lines,
        charged: lines.reduce((s, l) => s + l.total, 0),
        topups,
        otherCredits,
        openingBalance: input.openingBalance,
        closingBalance: last ? Number(last.balance_after_iqd) : input.openingBalance,
    };
}

const MONTHS_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];

/** "تشرين الثاني 2026" */
export function arabicMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return `${MONTHS_AR[m - 1]} ${y}`;
}

const METHOD_AR: Record<string, string> = {
    qi_card: "كي كارد",
    zain_cash: "زين كاش",
    bank_transfer: "حوالة مصرفية",
    cash: "نقداً",
};

function iqd(n: number): string {
    const sign = n < 0 ? "−" : "";
    return `${sign}${Math.round(Math.abs(n)).toLocaleString("en-US")} د.ع`;
}

function lineLabel(line: InvoiceLine): string {
    const n = line.count.toLocaleString("en-US");
    switch (line.kind) {
        case "monthly":
            return "الاشتراك الشهري";
        case "delivered":
            return `طلبات مُسلَّمة (${n})`;
        case "whatsappConfirm":
            return `رسائل واتساب تأكيد وتحديث (${n})`;
        case "whatsappOffer":
            return `رسائل واتساب عروض وتذكير (${n})`;
        case "whatsapp":
            return `رسائل واتساب (${n})`;
        case "orderCharge":
            return `رسوم طلبات (${n})`;
        case "other":
            return `رسوم أخرى (${n})`;
    }
}

function dayAr(iso: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baghdad", day: "numeric", month: "numeric" }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("day")} ${MONTHS_AR[Number(get("month")) - 1]}`;
}

function row(label: string, value: string, cls = ""): string {
    return `<tr${cls ? ` class="${cls}"` : ""}><td>${label}</td><td class="num">${value}</td></tr>`;
}

/** A full A4 HTML document for one monthly invoice. */
export function monthlyInvoiceDocument(inv: MonthlyInvoice): string {
    const charges = inv.lines.length
        ? inv.lines.map((l) => row(escapeHtml(lineLabel(l)), iqd(l.total))).join("")
        : row("لا توجد رسوم هذا الشهر", iqd(0));
    const credits = [
        ...inv.topups.map((t) =>
            row(`شحن المحفظة${t.method ? ` (${escapeHtml(METHOD_AR[t.method] ?? t.method)})` : ""}، ${dayAr(t.at)}`, iqd(t.amount)),
        ),
        inv.otherCredits > 0 ? row("إضافات أخرى للرصيد", iqd(inv.otherCredits)) : "",
    ].join("");
    const store = inv.displayId ? `${escapeHtml(inv.storeName)} (#${inv.displayId})` : escapeHtml(inv.storeName);

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>فاتورة ${escapeHtml(inv.number)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Tahoma, Arial, sans-serif; font-size: 13px; color: #111; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 4mm; margin-bottom: 5mm; }
  .brand { font-size: 22px; font-weight: 700; }
  .muted { color: #555; font-size: 12px; line-height: 1.8; }
  .to { margin-bottom: 5mm; line-height: 1.8; }
  h2 { font-size: 14px; margin: 6mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2.2mm 0; border-bottom: 1px solid #ddd; }
  .num { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
  td.num { text-align: left; }
  tr.total td { font-weight: 700; font-size: 15px; border-bottom: none; padding-top: 3mm; }
  .foot { margin-top: 8mm; color: #555; font-size: 11px; }
</style>
</head>
<body>
<div class="head">
  <div><div class="brand">شنايدر</div><div class="muted">فاتورة شهرية</div></div>
  <div class="muted">رقم الفاتورة: <span class="num">${escapeHtml(inv.number)}</span><br>الفترة: ${arabicMonth(inv.month)}</div>
</div>
<div class="to">إلى: ${store}</div>
<h2>الرسوم</h2>
<table>
${charges}
${row("المجموع", iqd(inv.charged), "total")}
</table>
<h2>المحفظة</h2>
<table>
${row("الرصيد في بداية الشهر", iqd(inv.openingBalance))}
${credits}
${row("الرسوم المخصومة", iqd(-inv.charged))}
${row("الرصيد في نهاية الشهر", iqd(inv.closingBalance), "total")}
</table>
<div class="foot">دُفعت الرسوم من رصيد المحفظة. لا توجد ضريبة. جميع المبالغ بالدينار العراقي.</div>
</body>
</html>`;
}
