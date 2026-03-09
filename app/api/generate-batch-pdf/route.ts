import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generate high-quality PDF for thermal label printing
 * Optimized for N41BT printer (80mm x 120mm @ 203 DPI)
 */
export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json();

    if (!html) {
      return NextResponse.json(
        { error: 'HTML content is required' },
        { status: 400 }
      );
    }

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Set viewport for thermal label size
    await page.setViewport({
      width: 302, // 80mm at 96 DPI
      height: 453, // 120mm at 96 DPI
      deviceScaleFactor: 2, // 2x for high DPI (203 DPI equivalent)
    });

    // Set content
    await page.setContent(html, {
      waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
    });

    // Wait for images, QR codes, barcodes to load
    await page.waitForTimeout(1000);

    // Generate PDF optimized for thermal printing
    const pdf = await page.pdf({
      width: '80mm',
      height: '120mm',
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      preferCSSPageSize: true,
      scale: 1,
    });

    await browser.close();

    // Return PDF
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="smart-batches-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('PDF GENERATION ERROR:');
    console.error('Error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Message:', error instanceof Error ? error.message : String(error));
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'Check server console for detailed error logs. Puppeteer may need Chrome/Chromium installed.'
      },
      { status: 500 }
    );
  }
}
