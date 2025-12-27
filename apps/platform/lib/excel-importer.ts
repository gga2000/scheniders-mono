/**
 * Excel/CSV Order Importer
 * 
 * Parses Excel/CSV files and maps to order format
 * Supports the user's format with Arabic column headers
 */

import * as XLSX from 'xlsx';
import { validateAddress, getAddressStatus, extractGovernorate } from './address-validator';

// =============================================
// TYPES
// =============================================

export interface ExcelRow {
    order_id: string;
    date: string;
    product_name: string;
    product_price: number;
    quantity: number;
    customer_name: string;
    phone: string;
    secondary_phone?: string;
    address: string;
    notes?: string;
    status?: string;
    sku?: string;
    raw_row_number: number;
}

export interface ParsedOrder {
    order_id: string;
    customer_name: string;
    phone: string;
    secondary_phone?: string;
    city?: string;
    governorate_code?: string;
    address_details: string;
    items: Array<{
        name: string;
        price: number;
        quantity: number;
        product_id?: string;
        image_url?: string;
        tag_color?: string;
        sku?: string;
    }>;
    price: number;
    notes?: string;
    status?: string;
    created_at?: string;
    source_rows: number[];
    is_abandoned?: boolean;
    validation: {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    };
}

export interface ImportResult {
    orders: ParsedOrder[];
    totalRows: number;
    validOrders: number;
    errorOrders: number;
    duplicateOrders: number;
    errors: Array<{ row: number; message: string }>;
}

// =============================================
// COLUMN HEADER MAPPING
// =============================================

// Map Arabic headers to our field names
const HEADER_MAPPING: Record<string, keyof ExcelRow> = {
    // Order ID
    'رقم الوصل': 'order_id',
    'رقم الطلب': 'order_id',
    'order_id': 'order_id',
    'order id': 'order_id',
    'id': 'order_id',

    // Date
    'التاريخ': 'date',
    'تاريخ': 'date',
    'date': 'date',

    // Product Name
    'اسم المنتج': 'product_name',
    'المنتج': 'product_name',
    'product': 'product_name',
    'product_name': 'product_name',

    // Product Price
    'سعر المنتج': 'product_price',
    'السعر': 'product_price',
    'price': 'product_price',
    'product_price': 'product_price',

    // Quantity
    'الكمية': 'quantity',
    'كمية': 'quantity',
    'quantity': 'quantity',
    'qty': 'quantity',

    // Customer Name
    'اسم الزبون': 'customer_name',
    'الزبون': 'customer_name',
    'الاسم': 'customer_name',
    'customer': 'customer_name',
    'customer_name': 'customer_name',
    'name': 'customer_name',

    // Primary Phone
    'رقم الهاتف الاول': 'phone',
    'رقم الهاتف': 'phone',
    'الهاتف': 'phone',
    'phone': 'phone',
    'phone1': 'phone',
    'mobile': 'phone',

    // Secondary Phone
    'رقم الهاتف الثاني': 'secondary_phone',
    'هاتف ثاني': 'secondary_phone',
    'phone2': 'secondary_phone',
    'secondary_phone': 'secondary_phone',

    // Address
    'العنوان': 'address',
    'عنوان': 'address',
    'address': 'address',

    // Status
    'حالة الطلب': 'status',
    'الحالة': 'status',
    'status': 'status',

    // SKU
    'sku': 'sku',
    'رمز المنتج': 'sku',

    // Notes
    'ملاحظة': 'notes',
    'ملاحظات': 'notes',
    'notes': 'notes',
    'note': 'notes',
};

// Map status string to OrderStatus
function mapImportStatus(statusStr: string | undefined): string {
    if (!statusStr) return 'new';

    // Normalize
    const s = statusStr.toLowerCase().trim();

    // Arabic mappings
    if (s.includes('جديد') || s.includes('new')) return 'new';
    if (s.includes('رسالة') || s.includes('مراسلة') || s.includes('contacted')) return 'contacted';
    if (s.includes('تثبيت') || s.includes('confirmed')) return 'confirmed';
    if (s.includes('بريد') || s.includes('transit')) return 'in_transit';
    if (s.includes('توصيل') || s.includes('delivered')) return 'delivered';
    if (s.includes('رفض') || s.includes('راجع') || s.includes('rejected')) return 'rejected';
    if (s.includes('ملغي') || s.includes('cancelled')) return 'cancelled';
    if (s.includes('تام') || s.includes('completed')) return 'completed';
    if (s.includes('لم يرد') || s.includes('no response')) return 'no_response';

    return 'new'; // Default
}

// =============================================
// PRODUCT CATALOGUE MATCHING
// =============================================

export interface ProductCatalogueItem {
    id: string;
    name: string;
    image_url?: string;
    tag_color?: string;
}

// Match product name to catalogue - uses substring matching for Arabic product names
export function matchProductFromCatalogue(
    productName: string,
    catalogue: ProductCatalogueItem[]
): ProductCatalogueItem | null {
    if (!productName || !catalogue.length) return null;

    const normalizedName = productName.toLowerCase().trim();

    // Define product name patterns to match (handles various Arabic spellings)
    const productPatterns: { patterns: string[], catalogueNameContains: string }[] = [
        // Persiferon - برسيفيرون / بيرسيفيرون / بيرسفيرون
        { patterns: ['برسيفيرون', 'بيرسيفيرون', 'بيرسفيرون', 'persiferon'], catalogueNameContains: 'برسيفيرون' },
        // Identity - ايدنتتي / ايدينتتي  
        { patterns: ['ايدنتتي', 'ايدينتتي', 'identity'], catalogueNameContains: 'ايدنتتي' },
        // Rifqat - رفقات
        { patterns: ['رفقات', 'rifqat'], catalogueNameContains: 'رفقات' },
        // Fusion - فيوجن
        { patterns: ['فيوجن', 'fusion'], catalogueNameContains: 'فيوجن' },
        // Pistachio - بستاشيو
        { patterns: ['بستاشيو', 'pistachio'], catalogueNameContains: 'بستاشيو' },
        // Esco - ايبسكو (note: with ب)
        { patterns: ['ايبسكو', 'ايسكو', 'esco'], catalogueNameContains: 'ايبسكو' },
    ];

    // Try pattern matching first
    for (const { patterns, catalogueNameContains } of productPatterns) {
        const matchesPattern = patterns.some(p => normalizedName.includes(p));
        if (matchesPattern) {
            // Find catalogue item that contains the matching name
            const catalogueItem = catalogue.find(c =>
                c.name.toLowerCase().includes(catalogueNameContains) ||
                catalogueNameContains.includes(c.name.toLowerCase())
            );
            if (catalogueItem) return catalogueItem;
        }
    }

    // Fallback: try exact name match
    const exactMatch = catalogue.find(c =>
        c.name.toLowerCase().trim() === normalizedName ||
        normalizedName.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(normalizedName)
    );
    if (exactMatch) return exactMatch;

    return null;
}

// =============================================
// PHONE NORMALIZATION
// =============================================

function normalizePhone(phone: string | number | undefined): string {
    if (!phone) return '';

    let phoneStr = String(phone).trim();

    // Remove all non-digit characters except +
    phoneStr = phoneStr.replace(/[^\d+]/g, '');

    // Handle Iraqi phone formats
    if (phoneStr.startsWith('00964')) {
        phoneStr = '+964' + phoneStr.slice(5);
    } else if (phoneStr.startsWith('964')) {
        phoneStr = '+964' + phoneStr.slice(3);
    } else if (phoneStr.startsWith('07')) {
        phoneStr = '+964' + phoneStr.slice(1);
    } else if (phoneStr.startsWith('7') && phoneStr.length === 10) {
        phoneStr = '+964' + phoneStr;
    }

    return phoneStr;
}

// =============================================
// DATE PARSING
// =============================================

function parseDate(dateValue: string | number | Date | undefined): string | undefined {
    if (!dateValue) return undefined;

    // Excel stores dates as numbers (days since 1900-01-01)
    if (typeof dateValue === 'number') {
        const excelEpoch = new Date(1899, 11, 30); // Excel epoch
        const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
        return date.toISOString();
    }

    if (dateValue instanceof Date) {
        return dateValue.toISOString();
    }

    // Try parsing string date formats
    const dateStr = String(dateValue).trim();

    // Format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr).toISOString();
    }

    // Format: DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        const [, day, month, year] = dmyMatch;
        return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
    }

    return undefined;
}

// =============================================
// ADDRESS PARSING
// =============================================

function parseAddress(address: string): { city?: string; details: string; governorateCode?: string } {
    if (!address) return { details: '' };

    const trimmed = address.trim();

    // Try to extract governorate from address
    const extraction = extractGovernorate(undefined, undefined, trimmed);

    if (extraction.governorate) {
        return {
            city: extraction.governorate.nameAr,
            details: trimmed,
            governorateCode: extraction.governorate.code,
        };
    }

    return { details: trimmed };
}

// =============================================
// EXCEL PARSING
// =============================================

export function parseExcelFile(file: ArrayBuffer, productCatalogue?: ProductCatalogueItem[]): ImportResult {
    const workbook = XLSX.read(file, { type: 'array', cellDates: true });

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON with headers - use raw: true to get actual numbers
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: true  // Changed to true to get raw number values
    });

    if (rawData.length === 0) {
        return {
            orders: [],
            totalRows: 0,
            validOrders: 0,
            errorOrders: 0,
            duplicateOrders: 0,
            errors: [{ row: 0, message: 'الملف فارغ أو لا يحتوي على بيانات' }]
        };
    }

    // Detect column headers from first row
    const firstRow = rawData[0];
    const headers = Object.keys(firstRow);

    // Map headers to our field names
    const columnMap: Record<string, keyof ExcelRow> = {};
    for (const header of headers) {
        const normalizedHeader = header.trim().toLowerCase();
        const originalHeader = header.trim();

        // Try exact match first, then normalized
        if (HEADER_MAPPING[originalHeader]) {
            columnMap[header] = HEADER_MAPPING[originalHeader];
        } else if (HEADER_MAPPING[normalizedHeader]) {
            columnMap[header] = HEADER_MAPPING[normalizedHeader];
        }
    }

    // Debug: log detected columns
    console.log('[Excel Import] Detected columns:', columnMap);
    console.log('[Excel Import] First row sample:', rawData[0]);

    // Parse rows
    const rows: ExcelRow[] = [];
    const errors: Array<{ row: number; message: string }> = [];

    // State for tracking multi-row abandoned orders
    let lastAbandonedId: string | null = null;
    let lastAbandonedKey: string | null = null;

    for (let i = 0; i < rawData.length; i++) {
        const rawRow = rawData[i];
        const rowNum = i + 2; // +2 for header row and 1-indexing

        try {
            const row: Partial<ExcelRow> = { raw_row_number: rowNum };

            for (const [excelHeader, fieldName] of Object.entries(columnMap)) {
                const value = rawRow[excelHeader];

                switch (fieldName) {
                    case 'order_id':
                        row.order_id = String(value || '').trim();
                        break;
                    case 'date':
                        row.date = String(value || '').trim();
                        break;
                    case 'product_name':
                        row.product_name = String(value || '').trim();
                        break;
                    case 'product_price':
                        // Handle both raw numbers and formatted strings
                        if (typeof value === 'number') {
                            row.product_price = value;
                        } else {
                            // Remove thousand separators (,), spaces, and non-numeric chars except .
                            const priceStr = String(value || '0').replace(/,/g, '').replace(/[^\d.]/g, '');
                            row.product_price = parseFloat(priceStr) || 0;
                        }
                        break;
                    case 'quantity':
                        // Handle both raw numbers and strings
                        if (typeof value === 'number') {
                            row.quantity = Math.round(value) || 1;
                        } else {
                            row.quantity = parseInt(String(value || '1').replace(/[^\d]/g, ''), 10) || 1;
                        }
                        break;
                    case 'customer_name':
                        row.customer_name = String(value || '').trim();
                        break;
                    case 'phone':
                        row.phone = normalizePhone(value as string | number);
                        break;
                    case 'secondary_phone':
                        row.secondary_phone = normalizePhone(value as string | number) || undefined;
                        break;
                    case 'address':
                        row.address = String(value || '').trim();
                        break;
                    case 'notes':
                        row.notes = String(value || '').trim() || undefined;
                        break;
                    case 'status':
                        row.status = String(value || '').trim() || undefined;
                        break;
                    case 'sku':
                        row.sku = String(value || '').trim() || undefined;
                        break;
                }
            }

            // --- SPECIAL HANDLING FOR ABANDONED CHECKOUTS ---
            const isAbandoned = row.order_id?.toLowerCase().includes('abandoned') || false;

            if (isAbandoned) {
                // Use phone as key to group abandoned items
                const currentKey = row.phone || 'unknown';

                // If it's the same customer (phone) as the last abandoned row, reuse the ID
                if (lastAbandonedKey === currentKey && lastAbandonedId) {
                    row.order_id = lastAbandonedId;
                } else {
                    // Generate a new unique ID for this abandoned order
                    // Format: ABN-{last 6 digits of timestamp}-{random 3 digits}
                    const timestamp = Date.now().toString().slice(-6);
                    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                    const newId = `ABN-${timestamp}-${random}`;

                    lastAbandonedId = newId;
                    lastAbandonedKey = currentKey;
                    row.order_id = newId;
                }

                // Append "Abandoned Checkout" to notes to identify it easily
                row.notes = row.notes ? `${row.notes} | Abandoned Checkout` : 'Abandoned Checkout';
            } else {
                // Reset tracking if we hit a normal order
                lastAbandonedId = null;
                lastAbandonedKey = null;
            }

            // Fallback for missing customer name (common in abandoned checkouts)
            if (!row.customer_name && row.phone) {
                row.customer_name = `زبون ${row.phone.slice(-4)}`;
            }

            // Validate required fields
            if (!row.order_id) {
                errors.push({ row: rowNum, message: 'رقم الوصل مفقود' });
                continue;
            }
            if (!row.customer_name) { // Still require customer name (which might be fallback)
                errors.push({ row: rowNum, message: 'اسم الزبون مفقود' });
                continue;
            }
            if (!row.phone) {
                errors.push({ row: rowNum, message: 'رقم الهاتف مفقود' });
                continue;
            }

            rows.push(row as ExcelRow);
        } catch (error) {
            errors.push({ row: rowNum, message: `خطأ في قراءة الصف: ${error}` });
        }
    }

    // Group rows by order_id (for multi-product orders)
    const orderMap = new Map<string, ExcelRow[]>();
    for (const row of rows) {
        const existing = orderMap.get(row.order_id) || [];
        existing.push(row);
        orderMap.set(row.order_id, existing);
    }

    // Convert to ParsedOrder objects
    const orders: ParsedOrder[] = [];

    for (const [orderId, orderRows] of orderMap) {
        const firstRow = orderRows[0];
        const addressParsed = parseAddress(firstRow.address);

        // Combine items from all rows and match to product catalogue
        const items = orderRows.map(row => {
            const productName = row.product_name || 'منتج غير محدد';
            const matchedProduct = productCatalogue ? matchProductFromCatalogue(productName, productCatalogue) : null;

            return {
                name: productName,
                price: row.product_price || 0,
                quantity: row.quantity || 1,
                product_id: matchedProduct?.id,
                image_url: matchedProduct?.image_url,
                tag_color: matchedProduct?.tag_color,
                sku: row.sku,
            };
        });

        // Calculate total price
        const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Validate order
        const validationErrors: string[] = [];
        const validationWarnings: string[] = [];

        // Phone validation
        if (!firstRow.phone || firstRow.phone.length < 10) {
            validationErrors.push('رقم الهاتف غير صالح');
        }

        // Address validation
        if (!addressParsed.governorateCode) {
            validationWarnings.push('لم يتم التعرف على المحافظة');
        }

        if (!addressParsed.details) {
            validationWarnings.push('العنوان فارغ');
        }

        // Price validation - warn if 0
        if (totalPrice === 0) {
            validationWarnings.push('السعر صفر');
            console.log('[Excel Import] Price is 0 for order:', orderId, 'items:', items);
        }

        // Determine if abandoned
        const isAbandoned = orderId.startsWith('ABN-');

        // Append abandoned note if needed
        let finalNotes = firstRow.notes;
        if (isAbandoned) {
            finalNotes = finalNotes ? `${finalNotes} | Abandoned Checkout` : 'Abandoned Checkout';
            validationWarnings.push('طلب متروك (Abandoned Checkouts)');
        }

        const parsedOrder: ParsedOrder = {
            order_id: orderId,
            customer_name: firstRow.customer_name,
            phone: firstRow.phone,
            secondary_phone: firstRow.secondary_phone,
            city: addressParsed.city,
            governorate_code: addressParsed.governorateCode,
            address_details: addressParsed.details,
            items,
            price: totalPrice,
            notes: finalNotes,
            status: firstRow.status,
            created_at: parseDate(firstRow.date),
            source_rows: orderRows.map(r => r.raw_row_number),
            is_abandoned: isAbandoned,
            validation: {
                isValid: validationErrors.length === 0,
                errors: validationErrors,
                warnings: validationWarnings,
            }
        };

        orders.push(parsedOrder);
    }

    return {
        orders,
        totalRows: rawData.length,
        validOrders: orders.filter(o => o.validation.isValid).length,
        errorOrders: orders.filter(o => !o.validation.isValid).length,
        duplicateOrders: 0, // Will be calculated when checking against DB
        errors,
    };
}

// =============================================
// CONVERT TO DATABASE FORMAT
// =============================================

export function convertToDbOrder(parsed: ParsedOrder): Record<string, unknown> {
    const status = mapImportStatus(parsed.status);

    return {
        order_id: parsed.order_id,
        customer_name: parsed.customer_name,
        phone: parsed.phone,
        secondary_phone: parsed.secondary_phone || null,
        city: parsed.city || null,
        governorate_code: parsed.governorate_code || null,
        validated_governorate_code: parsed.governorate_code || null,
        address_details: parsed.address_details || null,
        items: parsed.items,
        price: parsed.price,
        notes: parsed.notes || null,
        status: status,
        payment_status: 'cod',
        source: 'excel_import',
        created_at: parsed.created_at || new Date().toISOString(),
        internal_notes: parsed.is_abandoned ? 'تم استيراده كطلب متروك' : null,
        whatsapp_link: `https://wa.me/${parsed.phone.replace('+', '')}`,
        is_pinned: parsed.is_abandoned, // Pin abandoned orders to be noticeable
    };
}
