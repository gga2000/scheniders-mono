import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import { verifyAccessToken } from "@/lib/supabase-server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for large batches

const IS_DEV = process.env.NODE_ENV === 'development';

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
    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, error: authError } = await verifyAccessToken(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { html, pageWidth = '80mm', pageHeight = '120mm' } = await req.json();

    if (!html) {
      return NextResponse.json(
        { error: 'HTML content is required' },
        { status: 400 }
      );
    }

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

    const page = await browser.newPage();

    // Set content and wait for all resources (fonts, images, SVGs)
    await page.setContent(html, {
      waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
    });

    // Brief wait for SVG barcodes/QR codes to render
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate PDF with configurable page size
    const pdf = await page.pdf({
      width: pageWidth,
      height: pageHeight,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      scale: 1,
    });

    await browser.close();

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
