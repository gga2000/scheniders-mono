import { describe, expect, it } from "vitest";
import { PrimeApiError, type PrimeClient } from "@/lib/prime/client";
import {
    createDemoPrimeClient,
    DEMO_PRIME_FEE,
    demoCaseHistory,
    demoPaymentReceipts,
    demoShipmentInfo,
    primeWallClock,
    type DemoShipment,
} from "@/lib/prime/demo-client";
import { primeDistrictsOf } from "@/lib/prime/districts-load";
import { primeHistoryTime } from "@/lib/prime/track";

const NOW = Date.parse("2026-11-16T09:00:00Z");
const DAY = 86_400_000;

function parcel(over: Partial<DemoShipment> = {}): DemoShipment {
    return {
        caseId: 900_000_001,
        receipt: "9261110001",
        status: "ONWAY",
        stepCode: "ONWAY",
        charge: 5000,
        collect: 30000,
        sentAt: new Date(NOW - 3 * DAY).toISOString(),
        changedAt: new Date(NOW - 2 * DAY).toISOString(),
        paymentId: null,
        state: "BGD",
        ...over,
    };
}

function times(moves: { enteredAt: string | null }[]): number[] {
    return moves.map((m) => Date.parse(primeHistoryTime(m.enteredAt ?? "") ?? ""));
}

describe("demo Prime parcel journey", () => {
    it("writes times the way Prime does, in Baghdad wall clock", () => {
        expect(primeWallClock(Date.parse("2026-11-03T21:02:24Z"))).toBe("2026-11-04 00:02:24");
        expect(primeHistoryTime(primeWallClock(NOW))).toBe(new Date(NOW).toISOString());
    });

    it("walks a parcel with the driver along the road, ending where it is now", () => {
        const moves = demoCaseHistory(parcel(), NOW);
        expect(moves.map((m) => m.stepCode)).toEqual(["READYTOPICKUP", "NEWINSTORE", "NEW_ONWAY", "ONWAY"]);
        const at = times(moves);
        expect(at.every((t, i) => Number.isFinite(t) && (i === 0 || t >= at[i - 1]))).toBe(true);
        expect(at[at.length - 1]).toBe(NOW - 2 * DAY);
    });

    it("gives a parcel just sent one step, at its send", () => {
        const sentAt = new Date(NOW - 600_000).toISOString();
        const moves = demoCaseHistory(parcel({ stepCode: null, changedAt: null, sentAt }), NOW);
        expect(moves.map((m) => m.stepCode)).toEqual(["READYTOPICKUP"]);
        expect(times(moves)).toEqual([Date.parse(sentAt)]);
    });

    it("ends a delivered parcel on its delivery, after the whole road", () => {
        const moves = demoCaseHistory(parcel({ status: "DELIVERED", stepCode: "DLEIVERD" }), NOW);
        expect(moves.map((m) => m.stepCode)).toEqual(["READYTOPICKUP", "NEWINSTORE", "NEW_ONWAY", "ONWAY", "DLEIVERD"]);
        expect(moves[moves.length - 1].status).toBe("DELIVERED");
    });

    it("puts a failed attempt before a parcel coming back, and never a time out of order", () => {
        const back = parcel({
            status: "FAILED_DELIVER_RETURNED_TO_SENDER",
            stepCode: "RTN_WITH_PICKUPAGENT",
            sentAt: new Date(NOW - 2 * DAY).toISOString(),
            changedAt: new Date(NOW - DAY).toISOString(),
        });
        const moves = demoCaseHistory(back, NOW);
        expect(moves.map((m) => m.stepCode)).toEqual(["READYTOPICKUP", "NEWINSTORE", "NEW_ONWAY", "ONWAY", "RTN_WITHAGENT", "RTN_WITH_PICKUPAGENT"]);
        const at = times(moves);
        expect(at.every((t, i) => i === 0 || t >= at[i - 1])).toBe(true);
    });
});

describe("demo Prime payments", () => {
    const shipments = [
        parcel({ caseId: 1, paymentId: 91001, collect: 30000, changedAt: new Date(NOW - 6 * DAY).toISOString() }),
        parcel({ caseId: 2, paymentId: 91001, collect: 45000, changedAt: new Date(NOW - 5 * DAY).toISOString() }),
        parcel({ caseId: 3, paymentId: 91002, collect: 20000, changedAt: new Date(NOW - 3 * 3_600_000).toISOString() }),
        parcel({ caseId: 4, paymentId: null, collect: 99000 }),
    ];

    it("pays each payment's parcels less Prime's charge, newest first", () => {
        const receipts = demoPaymentReceipts(shipments, NOW);
        expect(receipts.map((r) => [r.id, r.transactionAmountIqd])).toEqual([
            [91002, 15000],
            [91001, 65000],
        ]);
    });

    it("pays the day after the last delivery, never in the future", () => {
        const [newest, older] = demoPaymentReceipts(shipments, NOW).map((r) => Date.parse(primeHistoryTime(r.createdDateTime ?? "") ?? ""));
        expect(older).toBe(NOW - 5 * DAY + 20 * 3_600_000);
        expect(newest).toBe(NOW - 3_600_000);
    });

    it("reports a parcel just sent as waiting for pickup, with Prime's charge", () => {
        expect(demoShipmentInfo(parcel({ stepCode: null, status: null, charge: null }))).toMatchObject({
            stepCode: "READYTOPICKUP",
            shipmentStatus: "ONWAY",
            shipmentCharge: DEMO_PRIME_FEE,
        });
    });
});

type Row = Record<string, unknown>;

/** prime_shipments as the demo client reads it: every filter applies to the rows. */
function fakeDb(rows: Row[]) {
    const reads: string[] = [];
    const from = (table: string) => {
        reads.push(table);
        let kept = rows;
        const q = {
            select: () => q,
            eq: (column: string, value: unknown) => {
                kept = kept.filter((r) => r[column] === value);
                return q;
            },
            in: (column: string, values: unknown[]) => {
                kept = kept.filter((r) => values.includes(r[column]));
                return q;
            },
            then: (resolve: (r: { data: Row[]; error: null }) => void) => resolve({ data: kept, error: null }),
        };
        return q;
    };
    return { db: { from } as unknown as Parameters<typeof createDemoPrimeClient>[0], reads };
}

const TENANT = "1233d2c7-5b46-4213-8733-6c5100ad26b5";

function row(caseId: number, over: Row = {}): Row {
    return {
        tenant_id: TENANT,
        case_id: caseId,
        receipt_no: `92611100${caseId}`,
        shipment_status: "DELIVERED",
        step_code: "DLEIVERD",
        shipment_charge: 5000,
        receipt_amount_iqd: 25000,
        sent_at: new Date(NOW - 4 * DAY).toISOString(),
        status_changed_at: new Date(NOW - 3 * DAY).toISOString(),
        payment_id: 91001,
        orders: { governorate_code: "BAS" },
        ...over,
    };
}

describe("demo Prime client", () => {
    it("answers payments and their parcels from the store's own rows only", async () => {
        const { db } = fakeDb([row(1), row(2, { payment_id: 91002 }), row(3, { tenant_id: "someone-else", payment_id: 91003 })]);
        const client = createDemoPrimeClient(db, TENANT, () => NOW);
        expect((await client.paymentReceipts("fermi-demo", 0, 20)).map((r) => r.id)).toEqual([91002, 91001]);
        expect(await client.paymentCases("fermi-demo", 91001)).toEqual([
            { caseid: 1, custReceiptNoOri: "926111001", receiptAmtIqd: 25000, shipmentCharge: 5000, state: "BAS" },
        ]);
        expect(await client.paymentCases("fermi-demo", 91003)).toEqual([]);
    });

    it("makes new parcels case ids no real Prime parcel has", async () => {
        const client = createDemoPrimeClient(fakeDb([]).db, TENANT);
        const caseId = await client.createShipment({} as Parameters<PrimeClient["createShipment"]>[0]);
        expect(caseId).toBeGreaterThanOrEqual(950_000_000);
        expect(caseId).toBeLessThan(1_000_000_000);
    });

    it("prices every parcel at Prime's flat charge and lists no districts", async () => {
        const client = createDemoPrimeClient(fakeDb([]).db, TENANT);
        expect(await client.shipmentCharge("fermi-demo", "BGD", 40000)).toBe(DEMO_PRIME_FEE);
        expect(await client.stateDistricts("BGD")).toEqual([]);
    });

    it("refuses tickets and webhook settings, and says a missing case is missing", async () => {
        const client = createDemoPrimeClient(fakeDb([]).db, TENANT);
        await expect(client.openTicket(1, "X", "hi")).rejects.toBeInstanceOf(PrimeApiError);
        await expect(client.saveWebhookConfig("UPDATE_STATUS", {} as Parameters<PrimeClient["saveWebhookConfig"]>[1])).rejects.toBeInstanceOf(PrimeApiError);
        await expect(client.caseHistory(123)).rejects.toMatchObject({ code: 4005 });
    });

    it("names the steps its parcels go through", async () => {
        const names = await createDemoPrimeClient(fakeDb([]).db, TENANT).stepNames();
        expect(names.get("ONWAY")).toBe("عند مندوب التوصيل");
        expect(names.get("DLEIVERD")).toBe("شحنات سلمت بنجاح");
    });

    it("never lends its empty district lists to the real client", async () => {
        const demo = createDemoPrimeClient(fakeDb([]).db, TENANT);
        const real = { stateDistricts: async () => [{ districtId: 7, districtName: "المنصور" }] } as unknown as PrimeClient;
        expect(await primeDistrictsOf(demo, "BGD")).toEqual([]);
        expect(await primeDistrictsOf(real, "BGD")).toEqual([{ id: 7, name: "المنصور" }]);
    });
});
