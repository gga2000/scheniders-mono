import type { PayrollRecord, OrderBreakdown, OrderStatusBreakdown } from "@/types/salary";

// =============================================================================
// SCHNEIDER — Arabic (RTL) employee payslip
//
// Design direction: a "luxury perfume house" receipt — warm parchment paper,
// rich plum hero blocks, vivid amber accents, editorial Arabic display type.
// Renders inside Chromium (server-side, via Puppeteer) so Arabic shaping,
// bidi, and ligatures are produced by the browser layout engine — not by a
// canvas rasteriser.
// =============================================================================

export interface PayslipData {
    record: PayrollRecord & { pdf_url?: string };
    employeeName: string;
    employeeEmail: string;
    employeeRole: string;
    employeeAvatarUrl?: string | null;
    perOrderBonus: number;
    companyName?: string;
    orderBreakdown?: OrderBreakdown;
    orderStatusBreakdown?: OrderStatusBreakdown;
}

// ── Palette ──────────────────────────────────────────────────────────────────
// Warm-parchment surface, espresso ink, plum hero, amber/gold accents, eight
// distinct status hues that harmonise on cream.
const C = {
    paper:      "#FBF7EE",
    panel:      "#F4ECDC",
    panelDeep:  "#EFE3C9",
    hairline:   "#E7DCC4",
    ink:        "#2A1A12",
    inkSoft:    "#5C463A",
    muted:      "#9A8676",
    faint:      "#C2B4A2",

    plum:       "#6B2E3A",   // hero
    plumDeep:   "#4F1F2A",
    plumTint:   "#EBD5DC",

    amber:      "#C77A1F",   // primary accent (perfume amber)
    amberSoft:  "#F2C77A",
    gold:       "#B58B4D",   // metallic hairline
    cream:      "#FBF1DD",   // on-dark light text

    // status spot palette (each tile gets its own hue)
    emerald:    "#0B7A4B",   emeraldBg: "#DCEFE3",
    teal:       "#0C6E7E",   tealBg:    "#D5ECEF",
    mustard:    "#A57516",   mustardBg: "#F5E7C2",
    stone:      "#6B5A4A",   stoneBg:   "#EAE1D2",
    clay:       "#B85F30",   clayBg:    "#F6E3D2",
    brick:      "#A8331E",   brickBg:   "#F4D7CE",
} as const;

const ROLE_AR: Record<string, string> = {
    admin: "مدير", manager: "مدير", employee: "موظف", agent: "موظف",
    staff: "موظف", delivery: "مندوب توصيل", accountant: "محاسب",
};

function fmtNum(n: number): string {
    return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}
function fmtIQD(n: number): string {
    return `${fmtNum(n)} د.ع`;
}
function fmtDateAr(d: string): string {
    const date = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
    return date.toLocaleDateString("ar-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
}
function fmtDateTimeAr(date: Date): string {
    return date.toLocaleDateString("ar-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }) +
        " · " + date.toLocaleTimeString("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
}
function esc(s: string): string {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "؟";
    return parts.length === 1 ? parts[0].slice(0, 2) : (parts[0][0] + parts[parts.length - 1][0]);
}

// ── Component pieces ─────────────────────────────────────────────────────────

function ledgerRow(label: string, value: string, opts: { sub?: string; valueColor?: string; strong?: boolean } = {}): string {
    const sub = opts.sub ? `<div class="sub">${opts.sub}</div>` : "";
    const valColor = opts.valueColor ?? C.ink;
    return `
    <div class="row${opts.strong ? " row-strong" : ""}">
      <div class="row-label"><span>${label}</span>${sub}</div>
      <div class="row-value" style="color:${valColor};">${value}</div>
    </div>`;
}

function statTile(label: string, value: string | number, fg: string, bg: string): string {
    return `
    <div class="tile" style="background:${bg};">
      <div class="tile-value" style="color:${fg};">${value}</div>
      <div class="tile-label" style="color:${fg};opacity:.78;">${label}</div>
    </div>`;
}

function sectionHead(eyebrow: string, title: string): string {
    return `
    <div class="section-head">
      <div class="eyebrow">${eyebrow}</div>
      <div class="title-row">
        <h3>${title}</h3>
        <span class="rule"></span>
      </div>
    </div>`;
}

// ── Document ─────────────────────────────────────────────────────────────────

export function buildPayslipHTML(data: PayslipData): string {
    const { record, employeeName, employeeEmail, employeeRole, perOrderBonus, companyName = "SCHNEIDER" } = data;

    const ob: OrderBreakdown = data.orderBreakdown ?? {
        completedTotal: record.completed_orders_count,
        genuine: record.completed_orders_count,
        replacements: 0,
        refunds: 0,
        qualityScore: record.completed_orders_count > 0 ? 1 : 0,
    };
    const sb = data.orderStatusBreakdown ?? null;
    const roleAr = ROLE_AR[employeeRole.toLowerCase()] ?? employeeRole;
    const totalDeductions = record.absence_deduction + record.advances_deducted + record.penalties_deducted;
    const qualityPct = Math.round((ob.qualityScore || 0) * 100);
    const issued = fmtDateTimeAr(new Date());
    const ref = record.id.slice(0, 16).toUpperCase();
    const periodLabel = `${fmtDateAr(record.period_start)} — ${fmtDateAr(record.period_end)}`;

    const earnings: string[] = [];
    earnings.push(ledgerRow("الراتب الأساسي الشهري", fmtIQD(record.base_salary)));
    if (record.order_bonus > 0) {
        earnings.push(ledgerRow(
            "حافز الطلبات المُسلّمة",
            "+ " + fmtIQD(record.order_bonus),
            { valueColor: C.emerald, sub: `${fmtNum(record.completed_orders_count)} طلب مدفوع × ${fmtIQD(perOrderBonus)}` }
        ));
    }
    if (record.performance_bonuses_total > 0) {
        earnings.push(ledgerRow("مكافآت الأداء", "+ " + fmtIQD(record.performance_bonuses_total), { valueColor: C.emerald }));
    }
    // Still owed from a part-paid earlier payroll: added to this net, not part of gross.
    const carriedIn = record.carried_in ?? 0;

    const deductions: string[] = [];
    if (record.absence_deduction > 0) {
        deductions.push(ledgerRow("استقطاع الغياب", "− " + fmtIQD(record.absence_deduction), { valueColor: C.brick, sub: `${fmtNum(record.absence_days)} يوم غياب` }));
    }
    if (record.advances_deducted > 0) {
        deductions.push(ledgerRow("السلف المسددة", "− " + fmtIQD(record.advances_deducted), { valueColor: C.clay }));
    }
    if (record.penalties_deducted > 0) {
        deductions.push(ledgerRow("الجزاءات والغرامات", "− " + fmtIQD(record.penalties_deducted), { valueColor: C.brick }));
    }

    const pipelineSection = sb ? `
      <section class="block">
        ${sectionHead("الفترة الحالية", "حركة الطلبات")}
        <div class="tiles">
          ${statTile("إجمالي الطلبات الواردة", fmtNum(sb.total),       C.ink,     C.panel)}
          ${statTile("مكتملة (مُسلّمة)",       fmtNum(sb.completed),   C.emerald, C.emeraldBg)}
          ${statTile("قيد التوصيل",            fmtNum(sb.inTransit),   C.teal,    C.tealBg)}
          ${statTile("قيد المعالجة",           fmtNum(sb.pending),     C.mustard, C.mustardBg)}
          ${statTile("ملغاة",                  fmtNum(sb.cancelled),   C.stone,   C.stoneBg)}
          ${statTile("لم يُرَد عليها",         fmtNum(sb.noResponse),  C.clay,    C.clayBg)}
          ${statTile("مرفوضة",                 fmtNum(sb.rejected),    C.brick,   C.brickBg)}
          ${statTile("مرتجعات / استرجاعات",    fmtNum(sb.returns),     C.plum,    C.plumTint)}
        </div>
      </section>` : "";

    const qualityBar = `
      <section class="block">
        ${sectionHead("جودة الأداء", "تحليل الطلبات المُسلّمة")}
        <div class="quality">
          <div class="q-rows">
            ${ledgerRow("إجمالي الطلبات المُسلّمة", fmtNum(ob.completedTotal))}
            ${ledgerRow("طلبات مدفوعة (صافية)", fmtNum(ob.genuine), { valueColor: C.emerald })}
            ${ledgerRow("استبدالات — مستثناة من الحافز", fmtNum(ob.replacements), { valueColor: C.mustard })}
            ${ledgerRow("مرتجعات / استرجاعات — مستثناة", fmtNum(ob.refunds), { valueColor: C.brick })}
          </div>
          <div class="q-meter">
            <div class="q-meter-head">
              <span class="q-meter-label">نسبة الجودة</span>
              <span class="q-meter-pct" style="color:${qualityPct >= 90 ? C.emerald : qualityPct >= 70 ? C.mustard : C.brick};">${qualityPct}%</span>
            </div>
            <div class="q-meter-track">
              <div class="q-meter-fill" style="width:${qualityPct}%;background:linear-gradient(90deg,${C.emerald},#34a06b);"></div>
            </div>
          </div>
        </div>
      </section>`;

    const noteBlock = record.notes ? `
      <aside class="note">
        <span class="note-tag">ملاحظة</span>
        <span class="note-body">${esc(record.notes)}</span>
      </aside>` : "";

    return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>قسيمة راتب — ${esc(employeeName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=Markazi+Text:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${C.paper}; }
  body {
    font-family: 'Almarai', 'Segoe UI', 'Tahoma', sans-serif;
    color: ${C.ink};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-feature-settings: 'kern', 'liga', 'calt';
  }
  .latin { font-family: 'Manrope', 'Segoe UI', sans-serif; direction: ltr; font-variant-numeric: tabular-nums; }
  .display { font-family: 'Markazi Text', 'Almarai', serif; font-weight: 700; }

  /* ─────────── Page shell ─────────── */
  .page {
    width: 210mm;
    min-height: 297mm;
    background: ${C.paper};
    position: relative;
    padding: 0;
    overflow: hidden;
  }

  /* ─────────── Header ─────────── */
  .hero {
    background: ${C.plum};
    color: ${C.cream};
    padding: 9mm 14mm 7mm;
    position: relative;
  }
  .hero::before {
    content: ""; position: absolute; inset: 0 0 auto 0; height: 1mm;
    background: linear-gradient(90deg, ${C.gold} 0%, ${C.amberSoft} 35%, ${C.gold} 70%, ${C.amber} 100%);
  }
  .hero-grid { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; }
  .hero-brand .mark {
    font-family: 'Manrope', sans-serif;
    font-weight: 800; font-size: 22pt; letter-spacing: 5px;
    color: ${C.cream}; line-height: 1;
  }
  .hero-brand .tagline {
    font-family: 'Markazi Text', serif; font-weight: 600;
    font-size: 12pt; color: ${C.amberSoft};
    margin-top: 3mm; letter-spacing: 1px;
  }
  .hero-meta { text-align: left; min-width: 56mm; }
  .hero-meta .period {
    font-family: 'Manrope', sans-serif; font-weight: 600; font-size: 9pt;
    color: ${C.cream}; opacity: .92; letter-spacing: .3px;
  }
  .hero-meta .meta-row {
    font-family: 'Manrope', sans-serif; font-size: 7.6pt;
    color: ${C.amberSoft}; opacity: .85; margin-top: 1.2mm; letter-spacing: .3px;
  }
  .hero-meta .meta-row.dim { color: ${C.cream}; opacity: .55; font-size: 7.2pt; }

  /* ─────────── Identity strip ─────────── */
  .identity {
    margin: -6mm 14mm 0;
    background: ${C.paper};
    border-radius: 4mm;
    box-shadow: 0 0 0 1px ${C.hairline}, 0 5mm 14mm -9mm rgba(50,20,10,.18);
    padding: 4mm 5.5mm;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 5mm;
    position: relative;
  }
  .monogram {
    width: 14mm; height: 14mm; border-radius: 50%;
    background: ${C.ink}; color: ${C.amberSoft};
    display: flex; align-items: center; justify-content: center;
    font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 13pt;
    letter-spacing: .5px; text-transform: uppercase; direction: ltr;
  }
  .who .name { font-family: 'Markazi Text', serif; font-weight: 700; font-size: 18pt; color: ${C.ink}; line-height: 1.1; }
  .who .email { font-family: 'Manrope', sans-serif; font-size: 8pt; color: ${C.muted}; margin-top: 1mm; direction: ltr; text-align: right; }
  .who .role-pill {
    display: inline-block; margin-top: 1.6mm;
    background: ${C.panelDeep}; color: ${C.ink};
    font-size: 7.8pt; font-weight: 800;
    padding: .6mm 3.5mm; border-radius: 999px; letter-spacing: .4px;
  }
  .net-callout {
    background: ${C.ink}; color: ${C.cream};
    border-radius: 3mm; padding: 3mm 6mm 3.5mm;
    min-width: 52mm; text-align: left; direction: ltr;
    position: relative; overflow: hidden;
  }
  .net-callout .lbl {
    font-family: 'Almarai', sans-serif; font-weight: 700;
    font-size: 7.4pt; color: ${C.amberSoft}; letter-spacing: .5px;
    direction: rtl; text-align: right;
  }
  .net-callout .amt {
    font-family: 'Manrope', sans-serif; font-weight: 800;
    font-size: 18pt; color: ${C.amberSoft}; margin-top: 1mm;
    direction: rtl; text-align: right; line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  /* ─────────── Body ─────────── */
  .body { padding: 5mm 14mm 0; }

  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }

  /* Block */
  .block { margin-top: 4mm; }
  .section-head { margin-bottom: 1.6mm; }
  .section-head .eyebrow {
    font-family: 'Manrope', sans-serif; font-size: 7pt; font-weight: 700;
    letter-spacing: 1.6px; text-transform: uppercase; color: ${C.amber};
  }
  .section-head .title-row { display: flex; align-items: baseline; gap: 3mm; margin-top: .4mm; }
  .section-head h3 {
    font-family: 'Markazi Text', serif; font-weight: 700;
    font-size: 13.5pt; color: ${C.ink}; margin: 0; line-height: 1;
  }
  .section-head .rule {
    flex: 1; height: 1px; background: ${C.gold}; opacity: .55;
  }

  /* Ledger rows */
  .ledger { background: ${C.paper}; border: 1px solid ${C.hairline}; border-radius: 3mm; padding: .8mm 3.5mm; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 4mm; padding: 1.8mm 0; border-bottom: 1px dashed ${C.hairline}; }
  .row:last-child { border-bottom: none; }
  .row-label { font-size: 9.4pt; font-weight: 700; color: ${C.ink}; line-height: 1.2; }
  .row-label .sub { font-family: 'Manrope', sans-serif; font-size: 7.2pt; font-weight: 500; color: ${C.muted}; margin-top: .6mm; letter-spacing: .3px; }
  .row-value { font-family: 'Manrope', sans-serif; font-size: 9.8pt; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .row-strong .row-label { font-size: 10.2pt; }
  .row-strong .row-value { font-size: 10.8pt; font-weight: 800; }

  .subtotal {
    display: flex; align-items: center; justify-content: space-between;
    background: ${C.panel}; border-radius: 2.5mm; padding: 2mm 4mm; margin-top: 1.8mm;
  }
  .subtotal .lbl { font-size: 9.8pt; font-weight: 800; color: ${C.ink}; }
  .subtotal .val { font-family: 'Manrope', sans-serif; font-size: 10.6pt; font-weight: 800; color: ${C.ink}; font-variant-numeric: tabular-nums; }
  .subtotal.warm { background: ${C.brickBg}; }
  .subtotal.warm .lbl { color: ${C.brick}; }
  .subtotal.warm .val { color: ${C.brick}; }

  /* Hero banner — net payable */
  .net-banner {
    margin-top: 5mm;
    background: ${C.plum};
    color: ${C.cream};
    border-radius: 3.5mm;
    padding: 4mm 7mm;
    display: flex; align-items: center; justify-content: space-between;
    position: relative; overflow: hidden;
  }
  .net-banner::after {
    content: ""; position: absolute; inset: auto 0 0 0; height: 1mm;
    background: linear-gradient(90deg, ${C.amber}, ${C.amberSoft}, ${C.amber});
    opacity: .9;
  }
  .net-banner .lbl {
    font-family: 'Markazi Text', serif; font-weight: 700;
    font-size: 13pt; color: ${C.amberSoft};
  }
  .net-banner .amt {
    font-family: 'Manrope', sans-serif; font-weight: 800;
    font-size: 19pt; color: ${C.amberSoft};
    font-variant-numeric: tabular-nums; direction: ltr;
  }

  /* Status tiles */
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; }
  .tile { border-radius: 3mm; padding: 2.6mm 3.2mm; min-height: 13mm; display: flex; flex-direction: column; justify-content: space-between; }
  .tile-value { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 14pt; line-height: 1; font-variant-numeric: tabular-nums; direction: ltr; text-align: right; }
  .tile-label { font-family: 'Almarai', sans-serif; font-weight: 700; font-size: 8pt; margin-top: 1mm; letter-spacing: .2px; }

  /* Quality block */
  .quality { background: ${C.paper}; border: 1px solid ${C.hairline}; border-radius: 3mm; padding: 2.6mm 4mm; }
  .q-rows { padding: 0 0 1.4mm; }
  .q-meter { padding-top: 2mm; border-top: 1px solid ${C.hairline}; }
  .q-meter-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.4mm; }
  .q-meter-label { font-size: 9.6pt; font-weight: 800; color: ${C.ink}; }
  .q-meter-pct { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 12.5pt; font-variant-numeric: tabular-nums; direction: ltr; }
  .q-meter-track { height: 2.4mm; background: ${C.panel}; border-radius: 999px; overflow: hidden; }
  .q-meter-fill { height: 100%; border-radius: 999px; }

  /* Note */
  .note {
    margin-top: 4mm; background: #FAEDD2; border: 1px solid ${C.amberSoft};
    border-radius: 3mm; padding: 2.2mm 4mm; display: flex; gap: 3mm; align-items: flex-start;
  }
  .note-tag { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 7.2pt; color: ${C.amber}; background: ${C.paper}; padding: .8mm 2.6mm; border-radius: 1.6mm; letter-spacing: .6px; white-space: nowrap; }
  .note-body { font-size: 9pt; color: ${C.inkSoft}; line-height: 1.5; }

  /* Signatures */
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 4mm; }
  .sign {
    background: ${C.paper}; border: 1px solid ${C.hairline}; border-radius: 3mm;
    padding: 2.6mm 4mm 3mm; text-align: center;
  }
  .sign .lbl { font-size: 8.4pt; font-weight: 700; color: ${C.muted}; letter-spacing: .3px; }
  .sign .ink-line { height: 1px; background: ${C.gold}; margin: 6mm 6mm 1.8mm; opacity: .8; }
  .sign .who-name { font-family: 'Markazi Text', serif; font-weight: 600; font-size: 11pt; color: ${C.ink}; }

  /* Footer */
  .foot {
    margin-top: 5mm;
    background: ${C.ink}; color: ${C.cream};
    padding: 2.8mm 14mm;
    display: flex; justify-content: space-between; align-items: center;
    position: relative;
  }
  .foot::before {
    content: ""; position: absolute; inset: 0 0 auto 0; height: 1mm;
    background: linear-gradient(90deg, ${C.gold}, ${C.amberSoft}, ${C.gold});
  }
  .foot .l { font-family: 'Almarai', sans-serif; font-weight: 700; font-size: 8pt; color: ${C.amberSoft}; }
  .foot .r { font-family: 'Manrope', sans-serif; font-size: 7.6pt; color: ${C.faint}; direction: ltr; letter-spacing: .8px; }
</style>
</head>
<body>
<div class="page">

  <!-- Hero header -->
  <header class="hero">
    <div class="hero-grid">
      <div class="hero-brand">
        <div class="mark latin">${esc(companyName)}</div>
        <div class="tagline">قسيمة راتب الموظف</div>
      </div>
      <div class="hero-meta">
        <div class="period">${periodLabel}</div>
        <div class="meta-row">صدرت في: ${issued}</div>
        <div class="meta-row dim">المرجع: <span class="latin">${ref}</span></div>
      </div>
    </div>
  </header>

  <!-- Identity + net callout -->
  <div class="identity">
    <div class="monogram">${esc(initials(employeeName))}</div>
    <div class="who">
      <div class="name">${esc(employeeName)}</div>
      <div class="email latin">${esc(employeeEmail)}</div>
      <span class="role-pill">${esc(roleAr)}</span>
    </div>
    <div class="net-callout">
      <div class="lbl">صافي المبلغ المستحق</div>
      <div class="amt">${fmtIQD(record.net_salary)}</div>
    </div>
  </div>

  <main class="body">

    <div class="columns">
      <!-- Earnings -->
      <section class="block" style="margin-top:0;">
        ${sectionHead("الفترة المحاسبية", "الاستحقاقات")}
        <div class="ledger">${earnings.join("")}</div>
        <div class="subtotal">
          <span class="lbl">إجمالي الاستحقاقات</span>
          <span class="val">${fmtIQD(record.gross_salary)}</span>
        </div>
      </section>

      <!-- Deductions -->
      <section class="block" style="margin-top:0;">
        ${sectionHead("الفترة المحاسبية", "الاستقطاعات")}
        ${deductions.length ? `
          <div class="ledger">${deductions.join("")}</div>
          <div class="subtotal warm">
            <span class="lbl">إجمالي الاستقطاعات</span>
            <span class="val">− ${fmtIQD(totalDeductions)}</span>
          </div>` : `
          <div class="ledger" style="padding:6mm 4mm;text-align:center;color:${C.muted};font-size:9.4pt;">
            لا توجد استقطاعات لهذه الفترة
          </div>`}
      </section>
    </div>

    ${carriedIn > 0 ? `
    <div class="ledger" style="margin-top:4mm;">${ledgerRow("متبقٍّ من راتب سابق (مُضاف إلى الصافي)", "+ " + fmtIQD(carriedIn), { valueColor: C.emerald })}</div>` : ""}

    <!-- Net payable hero banner -->
    <div class="net-banner">
      <div class="lbl">صافي الراتب المستحق</div>
      <div class="amt">${fmtIQD(record.net_salary)}</div>
    </div>
    ${record.amount_paid != null ? `
    <div class="ledger" style="margin-top:3mm;">
      ${ledgerRow("المبلغ المصروف الآن", fmtIQD(record.amount_paid))}
      ${ledgerRow("المتبقي له (يُضاف إلى الراتب القادم)", fmtIQD(record.net_salary - record.amount_paid), { valueColor: C.clay })}
    </div>` : ""}

    ${pipelineSection}

    ${qualityBar}

    ${noteBlock}

    <!-- Signatures -->
    <div class="signs">
      <div class="sign">
        <div class="lbl">توقيع الموظف</div>
        <div class="ink-line"></div>
        <div class="who-name">${esc(employeeName)}</div>
      </div>
      <div class="sign">
        <div class="lbl">اعتماد الإدارة</div>
        <div class="ink-line"></div>
        <div class="who-name">${esc(companyName)}</div>
      </div>
    </div>

  </main>

  <footer class="foot">
    <div class="l">${esc(companyName)} — قسيمة راتب سرّية للاستخدام الداخلي</div>
    <div class="r">Ref ${ref}</div>
  </footer>
</div>
</body>
</html>`;
}
