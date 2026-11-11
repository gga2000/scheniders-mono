import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import { formatOrderRow, ORDER_EXPORT_HEADERS } from "./order-export-utils";
import { csvCell, tsvCell } from "./customer-csv";

/**
 * ARCH-4 guard for the CSV export.
 *
 * Cells were wrapped in quotes without escaping the quotes inside them, so one
 * `"` in a customer name or address closed the field early and shifted every
 * following column on that row. No live order contains a quote today, which is
 * why it had not surfaced — but 11 real orders contain newlines, which survive
 * only because the value is quoted, so the quoting has to be right.
 *
 * The export uses the shared `csvCell` / `tsvCell` (lib/customer-csv), which
 * also stop a shopper-typed value from running as a spreadsheet formula.
 */
function order(partial: Partial<Order>): Order {
    return {
        id: "id",
        created_at: "2026-09-01T00:00:00.000Z",
        order_id: "1260901001",
        customer_name: "أحمد",
        phone: "07701234567",
        city: "بغداد",
        items: [{ name: "شاورما", quantity: 2, price: 6000 }],
        price: 12000,
        status: "delivered",
        payment_status: "cod",
        is_return: false,
        ...partial,
    } as Order;
}

describe("CSV cell quoting", () => {
    it("doubles an embedded quote instead of ending the field", () => {
        expect(csvCell('احمد "ابو علي"')).toBe('"احمد ""ابو علي"""');
    });

    it("keeps a comma inside one field", () => {
        const cell = csvCell("شارع الرشيد, قرب الجامع");
        expect(cell.split('","').length).toBe(1);
        expect(cell).toBe('"شارع الرشيد, قرب الجامع"');
    });

    it("turns a shopper-typed formula into plain text", () => {
        expect(csvCell("=HYPERLINK(\"http://x\",\"click\")")).toBe('"\'=HYPERLINK(""http://x"",""click"")"');
        expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
        expect(csvCell("-2+3")).toBe("'-2+3");
        // A phone in +964 form is data, not a formula.
        expect(csvCell("+9647701234567")).toBe("+9647701234567");
    });

    it("keeps a TSV cell on one cell and one row, formula-safe", () => {
        expect(tsvCell("=1+1")).toBe("'=1+1");
        expect(tsvCell("سطر\nثاني\tثالث")).toBe("سطر ثاني ثالث");
    });

    it("keeps a newline inside one quoted field", () => {
        expect(csvCell("سطر\nثاني")).toBe('"سطر\nثاني"');
    });

    it("renders a row with the same column count as the header", () => {
        const row = formatOrderRow(order({ customer_name: 'اسم "مقتبس"', address_details: "شارع, رقم 5" }));
        expect(row.length).toBe(ORDER_EXPORT_HEADERS.length);
        // The line still parses back as exactly that many fields.
        const line = row.map(csvCell).join(",");
        const fields = line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.filter((f) => f !== "") ?? [];
        expect(fields.length).toBe(ORDER_EXPORT_HEADERS.length);
    });

    it("formats items without a trailing space", () => {
        // The duplicate implementation in use-order-crud appended one, so the two
        // exports produced different files for the same order.
        const row = formatOrderRow(order({}));
        expect(row[5]).toBe("شاورما x2");
    });
});
