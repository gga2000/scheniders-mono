/**
 * Generate separator page HTML with large X
 * Used to separate batches when printing
 */
export function generateSeparatorPageHTML(batchName?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          width: 80mm;
          height: 120mm;
          margin: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          position: relative;
          overflow: hidden;
        }

        .separator-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        /* Large X made with two diagonal lines */
        .x-mark {
          position: relative;
          width: 60mm;
          height: 60mm;
        }

        .x-mark::before,
        .x-mark::after {
          content: '';
          position: absolute;
          background: #000;
          width: 8mm;
          height: 85mm;
          left: 50%;
          top: 50%;
        }

        .x-mark::before {
          transform: translate(-50%, -50%) rotate(45deg);
        }

        .x-mark::after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }

        /* Batch name at bottom */
        .batch-name {
          position: absolute;
          bottom: 15mm;
          left: 0;
          right: 0;
          text-align: center;
          font-family: Arial, sans-serif;
          font-size: 14pt;
          font-weight: bold;
          color: #000;
          padding: 0 5mm;
          word-wrap: break-word;
        }

        /* "SEPARATOR" text at top */
        .separator-text {
          position: absolute;
          top: 10mm;
          left: 0;
          right: 0;
          text-align: center;
          font-family: Arial, sans-serif;
          font-size: 18pt;
          font-weight: bold;
          color: #666;
          letter-spacing: 3px;
        }

        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          @page {
            size: 80mm 120mm;
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="separator-container">
        <div class="separator-text">SEPARATOR</div>
        <div class="x-mark"></div>
        ${batchName ? `<div class="batch-name">${batchName}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate separator page for A4/invoice printing
 */
export function generateA4SeparatorPageHTML(batchName?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          width: 210mm;
          height: 297mm;
          margin: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          position: relative;
          overflow: hidden;
        }

        .separator-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        /* Large X made with two diagonal lines */
        .x-mark {
          position: relative;
          width: 150mm;
          height: 150mm;
        }

        .x-mark::before,
        .x-mark::after {
          content: '';
          position: absolute;
          background: #000;
          width: 20mm;
          height: 210mm;
          left: 50%;
          top: 50%;
        }

        .x-mark::before {
          transform: translate(-50%, -50%) rotate(45deg);
        }

        .x-mark::after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }

        /* Batch name at bottom */
        .batch-name {
          position: absolute;
          bottom: 30mm;
          left: 0;
          right: 0;
          text-align: center;
          font-family: Arial, sans-serif;
          font-size: 24pt;
          font-weight: bold;
          color: #000;
          padding: 0 20mm;
          word-wrap: break-word;
        }

        /* "SEPARATOR" text at top */
        .separator-text {
          position: absolute;
          top: 30mm;
          left: 0;
          right: 0;
          text-align: center;
          font-family: Arial, sans-serif;
          font-size: 36pt;
          font-weight: bold;
          color: #666;
          letter-spacing: 5px;
        }

        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          @page {
            size: A4;
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="separator-container">
        <div class="separator-text">SEPARATOR</div>
        <div class="x-mark"></div>
        ${batchName ? `<div class="batch-name">${batchName}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}
