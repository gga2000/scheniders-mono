import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import { verifyAccessToken } from "@/lib/supabase-server";
import { buildPayslipHTML, type PayslipData } from "@/lib/payslip-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IS_DEV = process.env.NODE_ENV === "development";

const LOCAL_CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

async function getLocalChromePath(): Promise<string> {
    const fs = await import("fs");
    for (const p of LOCAL_CHROME_PATHS) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error("No local Chrome/Chromium found. Install Google Chrome for local PDF generation.");
}

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const data = (await req.json()) as PayslipData;
        if (!data?.record?.id || !data.employeeName) {
            return NextResponse.json({ error: "Invalid payslip data" }, { status: 400 });
        }

        const html = buildPayslipHTML(data);

        let browser;
        if (IS_DEV) {
            const executablePath = await getLocalChromePath();
            browser = await puppeteer.launch({
                executablePath,
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        } else {
            const chromium = (await import("@sparticuz/chromium")).default;
            browser = await puppeteer.launch({
                args: chromium.args,
                executablePath: await chromium.executablePath(),
                headless: true,
            });
        }

        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: ["networkidle0", "load", "domcontentloaded"] });
            // Let webfont shaping settle before printing (Google Fonts → Almarai/Markazi/Manrope).
            await page.evaluateHandle("document.fonts.ready");
            await new Promise(r => setTimeout(r, 250));

            const pdf = await page.pdf({
                format: "A4",
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: 0, right: 0, bottom: 0, left: 0 },
            });

            return new NextResponse(new Uint8Array(pdf), {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Cache-Control": "no-store",
                },
            });
        } finally {
            await browser.close();
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate payslip PDF";
        console.error("[payslip-pdf]", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
