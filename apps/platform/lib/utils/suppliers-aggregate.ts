import type { Product } from "@/lib/supabase";

export interface SupplyLink {
    product: Product;
    leadTimeDays: number | null;
    unitCost: number | null;
    moq: number | null;
    isPrimary: boolean;
}

export interface PoLink {
    id: string;
    poNumber: string;
    status: string;
    expectedDate: string | null;
    receivedAt: string | null;
    totalCost: number | null;
    createdAt: string | null;
}

export interface AggregatedSupplier {
    /** Case-preserving primary display name (first-seen casing wins). */
    name: string;
    /** Lower-cased key used for grouping. */
    key: string;
    contact: string;
    email: string;
    supplies: SupplyLink[];
    pos: PoLink[];
    /** Avg lead time across supplies where primary link exists, else across all. */
    avgLeadTimeDays: number | null;
    lastOrderAt: string | null;
    openPoCount: number;
    ytdSpend: number;
}

interface ProductSupplierRaw {
    supplier_name?: string;
    supplier_contact?: string;
    supplier_email?: string;
    lead_time_days?: number | null;
    minimum_order_quantity?: number | null;
    unit_cost?: number | null;
    is_primary?: boolean;
}

interface PoRaw {
    id: string;
    po_number: string;
    status: string;
    expected_date: string | null;
    received_at: string | null;
    total_cost: number | null;
    created_at: string | null;
    supplier_name: string | null;
    supplier_contact?: string | null;
    supplier_email?: string | null;
}

const OPEN_STATUSES = new Set(["draft", "sent", "confirmed"]);

function keyOf(name: string): string {
    return name.trim().toLowerCase();
}

/**
 * Builds per-supplier aggregates from (1) `products.suppliers` JSONB arrays
 * on every supply and (2) `purchase_orders` history. Names are grouped case-
 * insensitively but the first-seen casing is preserved for display.
 */
export function aggregateSuppliers({
    supplies,
    pos,
    currentYear = new Date().getFullYear(),
}: {
    supplies: Product[];
    pos: PoRaw[];
    currentYear?: number;
}): AggregatedSupplier[] {
    const map = new Map<string, AggregatedSupplier>();

    const ensure = (name: string, contact: string, email: string): AggregatedSupplier => {
        const key = keyOf(name);
        let agg = map.get(key);
        if (!agg) {
            agg = {
                name: name.trim(),
                key,
                contact,
                email,
                supplies: [],
                pos: [],
                avgLeadTimeDays: null,
                lastOrderAt: null,
                openPoCount: 0,
                ytdSpend: 0,
            };
            map.set(key, agg);
        } else {
            if (!agg.contact && contact) agg.contact = contact;
            if (!agg.email && email) agg.email = email;
        }
        return agg;
    };

    for (const p of supplies) {
        const raw = (p as unknown as { suppliers?: ProductSupplierRaw[] }).suppliers;
        const list = Array.isArray(raw) ? raw : [];
        for (const s of list) {
            const nm = (s?.supplier_name ?? "").trim();
            if (!nm) continue;
            const agg = ensure(nm, s.supplier_contact ?? "", s.supplier_email ?? "");
            agg.supplies.push({
                product: p,
                leadTimeDays: typeof s.lead_time_days === "number" ? s.lead_time_days : null,
                unitCost: typeof s.unit_cost === "number" ? s.unit_cost : null,
                moq: typeof s.minimum_order_quantity === "number" ? s.minimum_order_quantity : null,
                isPrimary: !!s.is_primary,
            });
        }
    }

    for (const po of pos) {
        const nm = (po.supplier_name ?? "").trim();
        if (!nm) continue;
        const agg = ensure(nm, po.supplier_contact ?? "", po.supplier_email ?? "");
        agg.pos.push({
            id: po.id,
            poNumber: po.po_number,
            status: po.status,
            expectedDate: po.expected_date,
            receivedAt: po.received_at,
            totalCost: po.total_cost,
            createdAt: po.created_at,
        });
    }

    for (const agg of map.values()) {
        // avg lead time: prefer primary links, else any link with a lead time.
        const primary = agg.supplies.filter((s) => s.isPrimary && s.leadTimeDays != null);
        const pool = primary.length > 0
            ? primary
            : agg.supplies.filter((s) => s.leadTimeDays != null);
        if (pool.length > 0) {
            const sum = pool.reduce((acc, s) => acc + (s.leadTimeDays ?? 0), 0);
            agg.avgLeadTimeDays = Math.round(sum / pool.length);
        }

        let lastMs = -Infinity;
        let openCount = 0;
        let ytdSpend = 0;
        for (const p of agg.pos) {
            const ts = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
            if (!Number.isNaN(ts) && ts > lastMs) {
                lastMs = ts;
                agg.lastOrderAt = p.createdAt;
            }
            if (OPEN_STATUSES.has(p.status)) openCount += 1;
            if (p.createdAt) {
                const year = new Date(p.createdAt).getFullYear();
                if (year === currentYear) ytdSpend += p.totalCost ?? 0;
            }
        }
        agg.openPoCount = openCount;
        agg.ytdSpend = ytdSpend;

        agg.pos.sort((a, b) => {
            const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bt - at;
        });
    }

    return Array.from(map.values()).sort((a, b) => {
        if (b.openPoCount !== a.openPoCount) return b.openPoCount - a.openPoCount;
        if (b.supplies.length !== a.supplies.length) return b.supplies.length - a.supplies.length;
        return a.name.localeCompare(b.name);
    });
}
