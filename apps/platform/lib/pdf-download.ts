/**
 * Client-side utility to generate PDFs via the server-side Puppeteer API
 * and trigger a browser download.
 */

export async function downloadLabelPdf(
  html: string,
  filename: string,
  accessToken: string,
  pageWidth = '80mm',
  pageHeight = '120mm'
): Promise<void> {
  // Strip auto-print scripts (not needed for server-side PDF generation)
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  const response = await fetch('/api/generate-batch-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      html: cleanHtml,
      pageWidth,
      pageHeight,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.details || `PDF generation failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
