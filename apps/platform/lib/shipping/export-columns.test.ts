import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { courierWorkbook, type CourierSheetOrder } from "./courier-sheets";
import {
    DEFAULT_HEADERS,
    GENERAL_LAYOUT,
    exportCellValue,
    exportFileName,
    formatPhoneForCourier,
    fullAddress,
    itemsText,
    layoutNameTaken,
    layoutProblem,
    layoutSheet,
    ordersWithoutGovernorate,
    parseSavedLayouts,
    targetSheet,
    type ExportLayout,
    type SavedLayout,
} from "./export-columns";

const order = (extra: Partial<CourierSheetOrder> = {}): CourierSheetOrder => ({
    order_id: "CHK-1001",
    customer_name: "زهراء علي",
    phone: "07701234567",
    secondary_phone: "",
    city: "الكوفة",
    governorate_code: "NJF",
    validated_governorate_code: undefined,
    address_details: "حي ميسان قرب جامع الكوفة الكبير، الشارع الثاني، الدار الثالثة على اليمين",
    items: [{ name: "سيروم", quantity: 2, price: 25000 }] as CourierSheetOrder["items"],
    notes: "",
    price: 50000,
    delivery_fee: 5000,
    discount_amount: 0,
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    ...extra,
});

const ctx = { storeName: "متجر النور", phoneFormat: "local" as const };

describe("phones in the courier's format", () => {
    it("writes the same mobile each of the four ways", () => {
        expect(formatPhoneForCourier("07701234567", "local")).toBe("07701234567");
        expect(formatPhoneForCourier("07701234567", "bare")).toBe("7701234567");
        expect(formatPhoneForCourier("07701234567", "intl")).toBe("9647701234567");
        expect(formatPhoneForCourier("07701234567", "intl_plus")).toBe("+9647701234567");
    });

    it("reads Arabic digits, spaces and a country code", () => {
        expect(formatPhoneForCourier("٠٧٧٠ ١٢٣ ٤٥٦٧", "local")).toBe("07701234567");
        expect(formatPhoneForCourier("+964 770 123 4567", "local")).toBe("07701234567");
        expect(formatPhoneForCourier("00964-770-123-4567", "intl_plus")).toBe("+9647701234567");
    });

    it("keeps a number that is not an Iraqi mobile as digits rather than dropping it", () => {
        expect(formatPhoneForCourier("01 234 5678", "intl")).toBe("12345678");
        expect(formatPhoneForCourier("", "local")).toBe("");
        expect(formatPhoneForCourier(null, "local")).toBe("");
    });
});

describe("cells", () => {
    it("lists each item with its size or colour and quantity, merged lines summed", () => {
        const o = order({
            items: [
                { name: "قميص", variant_name: "M / أسود", quantity: 1, price: 20000 },
                { name: "قميص", variant_name: "M / أسود", quantity: 1, price: 20000 },
                { name: "عطر 🌸", quantity: 1, price: 30000 },
            ] as CourierSheetOrder["items"],
        });
        expect(itemsText(o)).toBe("قميص (M / أسود) × 2 + عطر 🌸 × 1");
    });

    it("writes the full address once per part", () => {
        expect(fullAddress(order({ city: "النجف", address_details: "النجف - حي الأمير" }))).toBe("النجف - حي الأمير");
        expect(fullAddress(order({ city: "الكوفة", address_details: "حي ميسان" }))).toBe("النجف - الكوفة - حي ميسان");
    });

    it("writes amounts and counts as numbers, phones and order numbers as text", () => {
        const o = order({ secondary_phone: "٠٧٨٠١١١٢٢٢٣" });
        expect(exportCellValue(o, "cod_amount", ctx)).toBe(55000);
        expect(exportCellValue(o, "delivery_fee", ctx)).toBe(5000);
        expect(exportCellValue(o, "item_count", ctx)).toBe(2);
        expect(exportCellValue(o, "phone", ctx)).toBe("07701234567");
        expect(exportCellValue(o, "secondary_phone", ctx)).toBe("07801112223");
        expect(exportCellValue(o, "order_number", ctx)).toBe("1001");
        expect(exportCellValue(o, "store_name", ctx)).toBe("متجر النور");
        expect(exportCellValue(o, "governorate", ctx)).toBe("النجف");
    });

    it("a prepaid order collects nothing and says why", () => {
        const o = order({ payment_status: "prepaid", notes: "اتصل قبل" });
        expect(exportCellValue(o, "cod_amount", ctx)).toBe(0);
        expect(exportCellValue(o, "notes", ctx)).toBe("طلب مدفوع مسبقا - اتصل قبل");
    });
});

describe("the sheet in a layout", () => {
    const layout: ExportLayout = {
        columns: [
            { key: "phone", header: "الهاتف" },
            { key: "customer_name", header: "الاسم" },
            { key: "secondary_phone", header: "الهاتف" },
            { key: "cod_amount", header: "المبلغ" },
        ],
        phoneFormat: "intl_plus",
        fileFormat: "csv",
    };

    it("keeps the merchant's order and headers, and a repeated header stays two columns", () => {
        const sheet = layoutSheet([order({ secondary_phone: "07801112223" })], layout, { storeName: "", filename: "f.csv" });
        expect(sheet.headers).toEqual(["الهاتف", "الاسم", "الهاتف 2", "المبلغ"]);
        expect(sheet.rows[0]).toEqual({
            "الهاتف": "+9647701234567",
            "الاسم": "زهراء علي",
            "الهاتف 2": "+9647801112223",
            "المبلغ": 55000,
        });
        expect(sheet.widths).toHaveLength(4);
    });

    it("the general layout has every column under its plain header", () => {
        const sheet = layoutSheet([order()], GENERAL_LAYOUT, { storeName: "س", filename: "f.xlsx" });
        expect(sheet.headers).toEqual(Object.values(DEFAULT_HEADERS));
    });

    it("builds 600 orders in one sheet", () => {
        const many = Array.from({ length: 600 }, (_, i) => order({ order_id: String(5000 + i) }));
        const sheet = layoutSheet(many, GENERAL_LAYOUT, { storeName: "س", filename: "f.xlsx" });
        expect(sheet.rows).toHaveLength(600);
        expect(sheet.rows[599]["رقم الطلب"]).toBe("5599");
    });

    it("opens as a right-to-left workbook with Arabic intact and numbers as numbers", () => {
        const sheet = layoutSheet(
            [order({ items: [{ name: "قميص", variant_name: "L", quantity: 1, price: 1 }] as CourierSheetOrder["items"] })],
            GENERAL_LAYOUT,
            { storeName: "متجر النور", filename: "f.xlsx" },
        );
        const buffer = XLSX.write(courierWorkbook(XLSX, sheet), { type: "buffer", bookType: "xlsx" });
        const book = XLSX.read(buffer, { type: "buffer" });
        expect(book.Workbook?.Views?.[0]?.RTL).toBe(true);
        const ws = book.Sheets[book.SheetNames[0]];
        const cell = (header: string) => {
            const col = sheet.headers.indexOf(header);
            return ws[XLSX.utils.encode_cell({ r: 1, c: col })];
        };
        expect(cell("اسم الزبون")).toMatchObject({ t: "s", v: "زهراء علي" });
        expect(cell("رقم الهاتف")).toMatchObject({ t: "s", v: "07701234567" });
        expect(cell("المنتجات")).toMatchObject({ t: "s", v: "قميص (L) × 1" });
        expect(cell("المبلغ مع التوصيل")).toMatchObject({ t: "n", v: 55000 });
        expect(cell("عدد القطع")).toMatchObject({ t: "n", v: 1 });
        expect(cell("العنوان")?.v).toContain("الدار الثالثة على اليمين");
    });
});

describe("orders the courier cannot route", () => {
    it("flags an order with no governorate in its code, city or address", () => {
        const lost = order({ order_id: "2", governorate_code: undefined, city: "", address_details: "قرب السوق" });
        expect(ordersWithoutGovernorate([order(), lost]).map((o) => o.order_id)).toEqual(["2"]);
        // Still exported, with the governorate empty.
        expect(exportCellValue(lost, "governorate", ctx)).toBe("");
    });
});

describe("file name", () => {
    const date = new Date(2026, 10, 16, 9, 30);

    it("is fermi-<store>-<courier>-<date>", () => {
        expect(exportFileName("متجر النور", "Al-Waseet", date, "xlsx")).toBe("fermi-متجر-النور-Al-Waseet-2026-11-16.xlsx");
    });

    it("drops what a file system refuses and falls back when nothing is left", () => {
        expect(exportFileName('a/b:c*"d', "  ", date, "csv")).toBe("fermi-abcd-courier-2026-11-16.csv");
        expect(exportFileName("", "كويك", date, "csv")).toBe("fermi-store-كويك-2026-11-16.csv");
    });

    it("Prime and Al-Waseet keep their upload columns under the new name", () => {
        const prime = targetSheet({ kind: "prime" }, [order()], { storeName: "النور", date });
        expect(prime.filename).toBe("fermi-النور-Prime-2026-11-16.xlsx");
        expect(prime.headers).toContain("شفرة المحافظة");
        const mine = targetSheet(
            { kind: "layout", courierName: "كويك", layout: { ...GENERAL_LAYOUT, fileFormat: "csv" } },
            [order()],
            { storeName: "النور", date },
        );
        expect(mine.filename).toBe("fermi-النور-كويك-2026-11-16.csv");
    });
});

describe("saved layouts", () => {
    const row = {
        id: "a",
        name: "كويك",
        columns: [{ key: "phone", header: "الهاتف" }],
        phone_format: "bare",
        file_format: "csv",
    };

    it("reads a stored row and leaves out one that is not a layout", () => {
        const parsed = parseSavedLayouts([
            row,
            { ...row, id: "b", columns: [{ key: "password", header: "x" }] },
            { ...row, id: "c", columns: [] },
            { ...row, id: "d", phone_format: "weird" },
        ]);
        expect(parsed).toEqual([
            { id: "a", name: "كويك", layout: { columns: [{ key: "phone", header: "الهاتف" }], phoneFormat: "bare", fileFormat: "csv" } },
        ]);
    });

    it("is ready to save only with a column and every header filled", () => {
        expect(layoutProblem(GENERAL_LAYOUT)).toBeNull();
        expect(layoutProblem({ ...GENERAL_LAYOUT, columns: [] })).toBe("noColumns");
        expect(layoutProblem({ ...GENERAL_LAYOUT, columns: [{ key: "phone", header: "  " }] })).toBe("emptyHeader");
    });

    it("a name is taken by another layout in any case, never by the one being renamed", () => {
        const layouts: SavedLayout[] = [{ id: "a", name: "Kwick", layout: GENERAL_LAYOUT }];
        expect(layoutNameTaken(layouts, " kwick ")).toBe(true);
        expect(layoutNameTaken(layouts, "KWICK", "a")).toBe(false);
        expect(layoutNameTaken(layouts, "Najm")).toBe(false);
    });
});
