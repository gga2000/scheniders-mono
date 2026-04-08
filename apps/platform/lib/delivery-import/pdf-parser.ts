import type {
    ParsedDeliveryPDF,
    ParsedPDFHeader,
    ParsedPDFFinancials,
    ParsedPDFRow,
} from "@/types/delivery-import";
import { PDFParse } from "pdf-parse";

/**
 * Parse a Prime delivery company merchant account statement PDF.
 * Uses pdf-parse's table extraction for accurate cell-level data.
 *
 * Table columns (RTL → indices 0-11):
 * [notes, entryDate, itemCount, status, netToMerchant, deliveryFee, shipmentAmount, phone, address, shipmentNumber, store, rowNumber]
 */

// Column indices in the extracted table (RTL order)
const COL = {
    NOTES: 0,
    ENTRY_DATE: 1,
    ITEM_COUNT: 2,
    STATUS: 3,
    NET: 4,
    DELIVERY_FEE: 5,
    AMOUNT: 6,
    PHONE: 7,
    ADDRESS: 8,
    SHIPMENT_NUM: 9,
    STORE: 10,
    ROW_NUM: 11,
} as const;

/** Remove commas and parse as integer. Handles "-" as 0. */
function parseAmount(value: string): number {
    const cleaned = value.replace(/\n/g, "").trim();
    if (cleaned === "-" || cleaned === "") return 0;
    return parseInt(cleaned.replace(/,/g, ""), 10) || 0;
}

/** Clean up newlines in shipment numbers (e.g. "12603020\n01" → "1260302001") */
function normalizeShipmentNumber(raw: string): string {
    return raw.replace(/\n/g, "").trim();
}

/** Extract phone number from a cell (sometimes address bleeds into phone cell) */
function extractPhone(raw: string): string {
    // Phone pattern: 07 followed by 9 digits, or 05 followed by 9 digits (Kurdistan)
    const match = raw.match(/\b(0[5-9]\d{9})\b/);
    return match ? match[1] : raw.replace(/\n/g, " ").trim();
}

/** Check if a row is the price-change variant where columns shift */
function isPriceChangeRow(row: string[]): boolean {
    // In price change rows, the "count" cell (index 2) contains the status text with "ﺗﻐﻴﻴﺮ ﺳﻌﺮ"
    return row[COL.ITEM_COUNT]?.includes("ﺗﻐﻴﻴﺮ ﺳﻌﺮ") || row[COL.ITEM_COUNT]?.includes("تغيير سعر") || false;
}

/** Parse price change values from the status text */
function parsePriceChange(text: string): { original: number; newPrice: number } | null {
    // Pattern: "ﺍﻟﺸﺤﻨﺔ ﻣﻦ XX,XXX, ﺇﻟﻰ YY,YYY" or "الشحنة من XX,XXX إلى YY,YYY"
    const match = text.match(/([\d,]+)[,،]?\s*(?:ﺇﻟﻰ|إلى|الى)\s*\n?([\d,]+)/);
    if (match) {
        return {
            original: parseAmount(match[1]),
            newPrice: parseAmount(match[2]),
        };
    }
    return null;
}

/** Parse header metadata from the text-based extraction (page 1) */
function parseHeader(pageText: string): ParsedPDFHeader {
    const lines = pageText.split("\n");

    let paymentDate = "";
    let receiptNumber = "";
    let merchantName = "";
    let receivingAgent = "";
    let totalShipments = 0;

    for (const line of lines) {
        // Payment date: "2026-03-07\n16:43:12 تاريخ الدفع:"
        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch && !paymentDate) paymentDate = dateMatch[1];

        const timeMatch = line.match(/(\d{2}:\d{2}:\d{2})/);
        if (timeMatch && paymentDate) paymentDate += " " + timeMatch[1];

        // Receipt number
        const receiptMatch = line.match(/(\d{5,})\s*(?:ﺇﻳﺼﺎﻝ|إيصال)/);
        if (receiptMatch) receiptNumber = receiptMatch[1];

        // Merchant name
        if (line.includes("ﺇﺳﻢ ﺍﻟﺘﺎﺟﺮ") || line.includes("إسم التاجر")) {
            const nameMatch = line.match(/(.+?)\s*(?:ﺇﺳﻢ|إسم)/);
            if (nameMatch) merchantName = nameMatch[1].trim();
        }

        // Receiving agent
        if (line.includes("ﻣﻨﺪﻭﺏ") || line.includes("مندوب")) {
            const agentMatch = line.match(/^(\S+)\s*(?:ﻣﻨﺪﻭﺏ|مندوب)/);
            if (agentMatch) receivingAgent = agentMatch[1].trim();
        }

        // Total shipments
        const shipmentMatch = line.match(/(\d+)\s*(?:ﻋﺪﺩ ﺍﻟﺸﺤﻨﺎﺕ|عدد الشحنات)/);
        if (shipmentMatch) totalShipments = parseInt(shipmentMatch[1], 10);
    }

    return { merchantName, paymentDate, receiptNumber, receivingAgent, totalShipments };
}

/** Parse financial summary from the first table on page 1 */
function parseFinancials(table: string[][]): ParsedPDFFinancials {
    // Table has 5 rows: header, previous balance, net receipts, amount paid, new balance
    return {
        previousBalanceDebit: table[1] ? parseAmount(table[1][1]) : 0,
        previousBalanceCredit: table[1] ? parseAmount(table[1][0]) : 0,
        netReceiptsAmount: table[2] ? parseAmount(table[2][0]) : 0,
        amountPaid: table[3] ? parseAmount(table[3][1]) : 0,
        newBalanceDebit: table[4] ? parseAmount(table[4][1]) : 0,
        newBalanceCredit: table[4] ? parseAmount(table[4][0]) : 0,
    };
}

/** Parse a single order row from the table */
function parseOrderRow(row: string[]): ParsedPDFRow | null {
    if (row.length < 12) return null;

    const rowNumStr = row[COL.ROW_NUM]?.trim();
    const rowNumber = parseInt(rowNumStr, 10);
    if (isNaN(rowNumber)) return null; // Skip header rows

    const isPriceChange = isPriceChangeRow(row);

    let status: string;
    let itemCount: number;
    let notes: string;

    if (isPriceChange) {
        // In price-change rows, columns shift:
        // COL.ITEM_COUNT contains "ﺗﻢ ﺍﻟﺘﺴﻠﻴﻢ - ﻣﻊ ﺗﻐﻴﻴﺮ ﺳﻌﺮ X"
        // COL.STATUS contains "ﺍﻟﺸﺤﻨﺔ ﻣﻦ XX,XXX, ﺇﻟﻰ YY,YYY"
        // The item count is embedded at the end of the status text
        const statusText = row[COL.ITEM_COUNT].replace(/\n/g, " ").trim();
        const countMatch = statusText.match(/(\d+)$/);
        itemCount = countMatch ? parseInt(countMatch[1], 10) : 1;
        status = statusText.replace(/\s*\d+$/, "").trim();
        notes = row[COL.NOTES]?.replace(/\n/g, " ").trim() || "";
    } else {
        status = row[COL.STATUS]?.replace(/\n/g, " ").trim() || "";
        itemCount = parseInt(row[COL.ITEM_COUNT]?.trim() || "0", 10) || 0;
        notes = row[COL.NOTES]?.replace(/\n/g, " ").trim() || "";
    }

    const shipmentAmount = parseAmount(row[COL.AMOUNT]);
    const deliveryFee = parseAmount(row[COL.DELIVERY_FEE]);
    const netToMerchant = parseAmount(row[COL.NET]);

    const isNegative = shipmentAmount < 0 || netToMerchant < 0;
    const isPriceChanged = status.includes("ﺗﻐﻴﻴﺮ ﺳﻌﺮ") || status.includes("تغيير سعر");
    const isPartialDelivery = status.includes("ﺟﺰﺋﻴ") || status.includes("جزئي");

    // Parse price change values
    let originalPrice: number | undefined;
    let newPrice: number | undefined;
    if (isPriceChanged) {
        const priceChangeText = isPriceChange
            ? row[COL.STATUS]?.replace(/\n/g, " ").trim() || ""
            : status;
        const priceData = parsePriceChange(priceChangeText);
        if (priceData) {
            originalPrice = priceData.original;
            newPrice = priceData.newPrice;
        }
    }

    // Detect reorder references
    const isReorder = notes.toLowerCase().includes("reorder from");
    let reorderReference: string | undefined;
    if (isReorder) {
        const reorderMatch = notes.match(/Reorder from\s*#?\s*(.+)/i);
        if (reorderMatch) reorderReference = reorderMatch[1].trim();
    }

    return {
        rowNumber,
        storeName: row[COL.STORE]?.replace(/\n/g, " ").trim() || "",
        shipmentNumber: normalizeShipmentNumber(row[COL.SHIPMENT_NUM] || ""),
        address: row[COL.ADDRESS]?.replace(/\n/g, " ").trim() || "",
        phone: extractPhone(row[COL.PHONE] || ""),
        shipmentAmount,
        deliveryFee,
        netToMerchant,
        status,
        itemCount,
        entryDate: row[COL.ENTRY_DATE]?.trim() || "",
        notes,
        isNegative,
        isPriceChanged,
        isPartialDelivery,
        originalPrice,
        newPrice,
        isReorder,
        reorderReference,
    };
}

/**
 * Main entry point: parse a Prime delivery PDF buffer into structured data.
 * Uses pdf-parse's PDFParse class with getText() and getTable() methods.
 */
export async function parsePrimeDeliveryPDF(buffer: Buffer): Promise<ParsedDeliveryPDF> {
    const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });

    // Extract text for header metadata
    const textResult = await parser.getText();
    const page1Text = textResult.pages?.[0]?.text || "";
    const header = parseHeader(page1Text);

    // Extract tables for structured data
    const tableResult = await parser.getTable();

    let financials: ParsedPDFFinancials = {
        previousBalanceDebit: 0,
        previousBalanceCredit: 0,
        netReceiptsAmount: 0,
        amountPaid: 0,
        newBalanceDebit: 0,
        newBalanceCredit: 0,
    };

    const rows: ParsedPDFRow[] = [];
    let footerTotal = 0;

    for (const page of tableResult.pages) {
        for (const table of page.tables) {
            // Financial summary table (3 columns, 5 rows)
            if (table[0]?.length === 3 && page.num === 1) {
                financials = parseFinancials(table);
                continue;
            }

            // Order table (12 columns)
            if (table[0]?.length === 12) {
                for (const tableRow of table) {
                    // Check for footer row (مبلغ الوصولات بعد التوصيل)
                    if (
                        tableRow.some(
                            (c: string) =>
                                c.includes("ﻣﺒﻠﻎ ﺍﻟﻮﺻﻮﻻﺕ") ||
                                c.includes("مبلغ الوصولات")
                        )
                    ) {
                        const totalCell = tableRow.find(
                            (c: string) => /[\d,]+/.test(c) && !c.includes("ﺍﻟ")
                        );
                        if (totalCell) footerTotal = parseAmount(totalCell);
                        continue;
                    }

                    const parsed = parseOrderRow(tableRow);
                    if (parsed) rows.push(parsed);
                }
            }

            // Footer row might be a separate small table
            if (table[0]?.length < 12 && table[0]?.length > 1) {
                for (const tableRow of table) {
                    if (
                        tableRow.some(
                            (c: string) =>
                                c.includes("ﻣﺒﻠﻎ ﺍﻟﻮﺻﻮﻻﺕ") ||
                                c.includes("مبلغ الوصولات")
                        )
                    ) {
                        const totalCell = tableRow.find((c: string) =>
                            /^[\d,]+$/.test(c.trim())
                        );
                        if (totalCell) footerTotal = parseAmount(totalCell);
                    }
                }
            }
        }
    }

    // Validation
    const validationErrors: string[] = [];

    if (header.totalShipments > 0 && rows.length !== header.totalShipments) {
        validationErrors.push(
            `Row count mismatch: parsed ${rows.length} rows, header says ${header.totalShipments}`
        );
    }

    const calculatedTotal = rows.reduce((sum, r) => sum + r.netToMerchant, 0);
    if (footerTotal !== 0 && calculatedTotal !== footerTotal) {
        validationErrors.push(
            `Total mismatch: calculated ${calculatedTotal.toLocaleString()} IQD, footer says ${footerTotal.toLocaleString()} IQD`
        );
    }

    await parser.destroy();

    return {
        header,
        financials,
        rows,
        footerTotal,
        validationErrors,
    };
}
