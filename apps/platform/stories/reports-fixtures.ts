import type { ReportOrder } from "@/lib/analytics/report-order-facts";

/** Deterministic pseudo-random so screenshots are stable. */
function rng(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

const CITIES: [string, string][] = [
    ["Baghdad", "BG"], ["Basra", "BA"], ["Erbil", "AR"], ["Najaf", "NA"], ["Mosul", "NI"], ["Kirkuk", "TS"], ["Karbala", "KA"],
];
const REASONS = ["Customer refused", "Wrong address", "Price objection", "Not reachable", "Changed mind", "Found cheaper", "Late delivery", "Fake order"];
const STATUSES = ["new", "contacted", "confirmed", "no_response", "cancelled", "in_transit", "delivered", "delivered", "delivered", "completed", "rejected"];
const SOURCES = ["lightfunnels", "whatsapp", "manual", "meta"];

/** Orders spread over `days` days ending `end`. */
export function buildReportFixtures(end: Date, days: number, count: number, seed = 7): ReportOrder[] {
    const r = rng(seed);
    return Array.from({ length: count }, (_, i) => {
        const created = new Date(end.getTime() - r() * days * 86400000);
        created.setHours(Math.floor(9 + r() * 13), Math.floor(r() * 60));
        const status = STATUSES[Math.floor(r() * STATUSES.length)];
        const [city, gov] = CITIES[Math.floor(Math.pow(r(), 1.6) * CITIES.length)];
        const delivered = status === "delivered" || status === "completed";
        const isReturn = i % 29 === 0;
        return {
            created_at: created.toISOString(),
            status,
            delivered_at: delivered ? new Date(created.getTime() + (1 + r() * 5) * 86400000).toISOString() : null,
            contact_count: Math.floor(r() * 4),
            city,
            governorate_code: gov,
            validated_governorate_code: null,
            rejection_reason: status === "rejected" ? REASONS[Math.floor(r() * REASONS.length)] : null,
            phone: i % 41 === 0 ? "" : "07701234567",
            needs_attention: i % 37 === 0,
            attention_reasons: i % 37 === 0 ? ["missing_product"] : null,
            address_status: i % 23 === 0 ? "needs_review" : null,
            source: SOURCES[Math.floor(r() * SOURCES.length)],
            is_return: isReturn,
            notes: isReturn ? "استرجاع: منتج تالف | ..." : null,
            price: isReturn ? -(20000 + Math.floor(r() * 5) * 10000) : 20000 + Math.floor(r() * 8) * 5000,
        };
    });
}
