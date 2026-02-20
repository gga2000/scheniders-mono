from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem

OUT = "output/pdf/scheniders_app_summary_one_page.pdf"


def bullet_list(items, style):
    return ListFlowable(
        [ListItem(Paragraph(i, style), leftIndent=8) for i in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontSize=7,
        bulletOffsetY=2,
        spaceBefore=1,
        spaceAfter=2,
    )


def build():
    doc = SimpleDocTemplate(
        OUT,
        pagesize=LETTER,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.45 * inch,
        title="Schenider App Summary",
        author="Codex",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=16,
        textColor=colors.HexColor("#111827"),
        spaceAfter=5,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#1f2937"),
        spaceBefore=4,
        spaceAfter=2,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.7,
        leading=11,
        textColor=colors.HexColor("#111827"),
        spaceAfter=3,
    )
    bullet = ParagraphStyle(
        "Bullet",
        parent=body,
        fontSize=8.5,
        leading=10.5,
        spaceAfter=0,
    )

    story = []

    story.append(Paragraph("Schenider App - One-Page Repository Summary", h1))
    story.append(Paragraph("Repo scanned: /Users/ali/Scheniders", body))

    story.append(Paragraph("What It Is", h2))
    story.append(
        Paragraph(
            "A Next.js order management web app for the Schenider team, with Supabase as the backend and a dashboard-style UI. "
            "The repository shows operations tooling for orders, analytics, printing, customers/products, and team workflows.",
            body,
        )
    )

    story.append(Paragraph("Who It Is For", h2))
    story.append(
        Paragraph(
            "Primary persona: Schenider business operations staff (admin/employee/viewer roles) managing perfume orders and delivery workflows in Iraq.",
            body,
        )
    )

    story.append(Paragraph("What It Does", h2))
    features = [
        "Runs a centralized orders workspace with filters, saved views, timeline/notes, duplicate checks, and bulk actions.",
        "Supports order lifecycle operations including status workflows, cancellation/rejection handling, split orders, and return flow states.",
        "Provides analytics and finance screens for revenue/profit views, expenses, period comparison, and report export (CSV/Excel/print).",
        "Includes printing operations for labels/invoices, batch creation/history, reprint warnings, and post-print status updates.",
        "Offers dedicated modules/pages for customers, products, team analytics, reports, and settings.",
        "Enforces auth and role-based access control with permission checks and guarded pages/routes.",
        "Integrates with LightFunnels via webhook ingestion and manual sync APIs, plus scheduled no-response automation.",
    ]
    story.append(bullet_list(features, bullet))

    story.append(Paragraph("How It Works (Repo Evidence)", h2))
    arch = [
        "UI layer: Next.js App Router pages under app/ (dashboard, orders, analytics, printing, products, customers, team, reports, settings).",
        "Composition layer: app/layout.tsx wraps pages with AuthProvider, QueryProvider, OrdersProvider, PWAProvider, ThemeProvider, LanguageProvider, and DashboardLayout.",
        "State/data layer: useOrders() uses React Query cache/mutations plus Supabase realtime (postgres_changes on orders) with polling fallback and offline queue handling.",
        "Backend/data services: Supabase browser/server clients handle auth and database access; auth provider loads role + permission data from role/user permission tables.",
        "Server integration layer: /api/webhooks/lightfunnels (order ingestion), /api/lightfunnels/sync (token/test/sync), /api/cron/auto-no-response (scheduled status automation).",
        "Data flow (compact): Browser UI -> Providers/Hooks -> Supabase client + internal API routes -> Supabase tables/RPC -> realtime/persisted cache updates UI.",
    ]
    story.append(bullet_list(arch, bullet))

    story.append(Paragraph("How To Run (Minimal)", h2))
    run_steps = [
        "Install dependencies: <font name='Courier'>npm install</font>",
        "Create env file: <font name='Courier'>.env.local</font> with <font name='Courier'>NEXT_PUBLIC_SUPABASE_URL</font> and <font name='Courier'>NEXT_PUBLIC_SUPABASE_ANON_KEY</font> (see <font name='Courier'>env.example</font>).",
        "Database bootstrap command/script: <b>Not found in repo.</b> (README references <font name='Courier'>supabase-schema.sql</font>, but that file is not present at repo root.)",
        "Start dev server: <font name='Courier'>npm run dev</font> then open <font name='Courier'>http://localhost:3000</font>.",
    ]
    story.append(bullet_list(run_steps, bullet))

    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            "Evidence sampled from: README.md, package.json, app/layout.tsx, hooks/use-orders.ts, components/providers/*, lib/supabase*.ts, middleware.ts, and app/api/* routes.",
            ParagraphStyle("Foot", parent=body, fontSize=7.4, leading=9.2, textColor=colors.HexColor("#4b5563")),
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build()
    print(OUT)
