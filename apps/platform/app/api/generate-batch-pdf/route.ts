import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import { z } from 'zod';
import { requireMeteredCaller } from "@/lib/auth/require-metered-caller";
import { isAllowedPdfRequest } from "@/lib/pdf-request-allowlist";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for large batches

const IS_DEV = process.env.NODE_ENV === 'development';

const CSS_LENGTH = /^\d{1,4}(\.\d{1,2})?(mm|cm|in|px)$/;
const bodySchema = z.object({
  html: z.string().min(1).max(8_000_000),
  pageWidth: z.string().regex(CSS_LENGTH).default('80mm'),
  pageHeight: z.string().regex(CSS_LENGTH).default('120mm'),
});

// Common Chrome paths on macOS for local development
const LOCAL_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

async function getLocalChromePath(): Promise<string> {
  const fs = await import('fs');
  for (const p of LOCAL_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No local Chrome/Chromium found. Install Google Chrome for local PDF generation.');
}

/**
 * Generate high-quality PDF from HTML using headless Chrome.
 * Uses local Chrome in development, @sparticuz/chromium on Vercel.
 */
export async function POST(req: NextRequest) {
  try {
    // Headless Chrome is billed compute: store members only, capped per store.
    const caller = await requireMeteredCaller(req, { bucket: "label-pdf", limit: 120, windowSeconds: 3600 });
    if (!caller.ok) return caller.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid label request' }, { status: 400 });
    }
    const { html, pageWidth, pageHeight } = parsed.data;

    let browser;
    if (IS_DEV) {
      // Local development: use system Chrome
      const executablePath = await getLocalChromePath();
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } else {
      // Production (Vercel): use @sparticuz/chromium
      const chromium = (await import('@sparticuz/chromium')).default;
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }

    let pdf: Uint8Array;
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (isAllowedPdfRequest(request.url())) void request.continue();
        else void request.abort('blockedbyclient');
      });

      // Wait for the label font (Google Fonts) and inline SVG codes to load.
      await page.setContent(html, {
        waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
      });
      await page.evaluate(() => document.fonts.ready);

      pdf = await page.pdf({
        width: pageWidth,
        height: pageHeight,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
        scale: 1,
      });
    } finally {
      await browser.close();
    }

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="labels-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('PDF GENERATION ERROR:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
