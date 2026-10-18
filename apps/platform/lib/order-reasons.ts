import { supabase } from "@/lib/supabase";

// =============================================
// ORDER REASONS — shared types, defaults, repository
// =============================================
// Powers both the cancellation dialog (kind="cancel", BEFORE shipping) and the
// rejection dialog (kind="reject", AFTER shipping). Backed by the tenant-scoped
// `order_reasons` table — RLS filters reads by membership. Writes inject
// tenant_id explicitly so the policy WITH CHECK passes.
//
// Falls back to the DEFAULT_* lists if the live query returns no rows (e.g. a
// tenant that somehow has no seeded reasons yet) so the dialog is never empty.

export type ReasonKind = "cancel" | "reject";

export interface OrderReason {
    id: string;
    kind: ReasonKind;
    label_ar: string;
    label_en: string | null;
    sort_order: number;
    is_active: boolean;
    is_system: boolean;
    requires_note: boolean;
    color?: string | null;
    emoji?: string | null;
    /** Previous label_ar values, kept so renames don't orphan historical usage counts. */
    aliases?: string[];
}

export const REASON_COLORS: { key: string; dot: string }[] = [
    { key: "slate", dot: "bg-slate-400" },
    { key: "rose", dot: "bg-rose-500" },
    { key: "orange", dot: "bg-orange-500" },
    { key: "amber", dot: "bg-amber-500" },
    { key: "emerald", dot: "bg-emerald-500" },
    { key: "sky", dot: "bg-sky-500" },
    { key: "violet", dot: "bg-violet-500" },
    { key: "pink", dot: "bg-pink-500" },
];

export function reasonColorDot(color?: string | null): string | null {
    if (!color) return null;
    return REASON_COLORS.find((c) => c.key === color)?.dot ?? null;
}

// Mirror of the seed in 20260603220000_order_reasons.sql, used only when the
// live query returns empty (e.g. brand-new tenant before the per-tenant seed
// landed). Real tenants get their DB-backed rows.
export const DEFAULT_CANCEL_REASONS: OrderReason[] = [
    { id: "d-cancel-no_reply", kind: "cancel", label_ar: "لم يرد العميل", label_en: "Customer didn't reply", sort_order: 1, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-cancelled", kind: "cancel", label_ar: "ألغى العميل", label_en: "Customer cancelled", sort_order: 2, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-outside", kind: "cancel", label_ar: "خارج منطقة التوصيل", label_en: "Outside delivery area", sort_order: 3, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-unavailable", kind: "cancel", label_ar: "منتج غير متوفر", label_en: "Product unavailable", sort_order: 4, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-price", kind: "cancel", label_ar: "سعر غير مناسب", label_en: "Price issue", sort_order: 5, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-duplicate", kind: "cancel", label_ar: "طلب مكرر", label_en: "Duplicate order", sort_order: 6, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-wrong_info", kind: "cancel", label_ar: "معلومات خاطئة", label_en: "Wrong information", sort_order: 7, is_active: true, is_system: false, requires_note: false },
    { id: "d-cancel-other", kind: "cancel", label_ar: "سبب آخر", label_en: "Other", sort_order: 100, is_active: true, is_system: true, requires_note: true },
];

export const DEFAULT_REJECT_REASONS: OrderReason[] = [
    { id: "d-reject-no_answer", kind: "reject", label_ar: "لا يجاوب", label_en: "No answer", sort_order: 1, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-wrong_address", kind: "reject", label_ar: "عنوان خاطئ", label_en: "Wrong address", sort_order: 2, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-refused", kind: "reject", label_ar: "رفض العميل", label_en: "Customer refused", sort_order: 3, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-price", kind: "reject", label_ar: "لم يوافق على السعر", label_en: "Price disagreement", sort_order: 4, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-postponed", kind: "reject", label_ar: "طلب التأجيل", label_en: "Requested postponement", sort_order: 5, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-not_available", kind: "reject", label_ar: "غير متواجد", label_en: "Not available", sort_order: 6, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-phone_off", kind: "reject", label_ar: "الهاتف مغلق", label_en: "Phone off", sort_order: 7, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-wrong_product", kind: "reject", label_ar: "منتج خاطئ", label_en: "Wrong product", sort_order: 8, is_active: true, is_system: false, requires_note: false },
    { id: "d-reject-other", kind: "reject", label_ar: "سبب آخر", label_en: "Other", sort_order: 100, is_active: true, is_system: true, requires_note: true },
];

export function defaultReasons(kind: ReasonKind): OrderReason[] {
    return kind === "reject" ? DEFAULT_REJECT_REASONS : DEFAULT_CANCEL_REASONS;
}

export function isFallbackReason(reason: Pick<OrderReason, "id">): boolean {
    return reason.id.startsWith("d-cancel-") || reason.id.startsWith("d-reject-");
}

/**
 * Collapse reasons that share the same visible Arabic label, keeping the first
 * occurrence (callers pass a list already ordered by sort_order). Pickers select
 * by `label_ar`, so two rows with the same label are indistinguishable to the
 * user — some tenants have such duplicates from overlapping seeds. Used for the
 * picker only; the reasons editor still sees every row so duplicates stay
 * manageable.
 */
export function dedupeReasonsByLabel<T extends Pick<OrderReason, "label_ar">>(reasons: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of reasons) {
        const key = r.label_ar.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}

export interface FetchReasonsResult {
    reasons: OrderReason[];
    /** true when we served the hardcoded fallback (no rows for this tenant). */
    isFallback: boolean;
}

export async function fetchOrderReasons(kind: ReasonKind): Promise<FetchReasonsResult> {
    try {
        const { data, error } = await supabase
            .from("order_reasons")
            .select("*")
            .eq("kind", kind)
            .order("sort_order", { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
            return { reasons: defaultReasons(kind), isFallback: true };
        }
        return { reasons: data as OrderReason[], isFallback: false };
    } catch {
        return { reasons: defaultReasons(kind), isFallback: true };
    }
}

export async function createOrderReason(input: {
    tenant_id: string;
    kind: ReasonKind;
    label_ar: string;
    label_en?: string | null;
    sort_order: number;
}): Promise<OrderReason> {
    const { data, error } = await supabase
        .from("order_reasons")
        .insert([{
            tenant_id: input.tenant_id,
            kind: input.kind,
            label_ar: input.label_ar,
            label_en: input.label_en || null,
            sort_order: input.sort_order,
            is_active: true,
        }])
        .select()
        .single();
    if (error) throw error;
    return data as OrderReason;
}

export async function updateOrderReason(
    id: string,
    patch: Partial<Pick<OrderReason, "label_ar" | "label_en" | "is_active" | "sort_order" | "requires_note" | "color" | "emoji" | "aliases">>,
): Promise<void> {
    const { error } = await supabase.from("order_reasons").update(patch).eq("id", id);
    if (error) throw error;
}

export async function deleteOrderReason(id: string): Promise<void> {
    const { error } = await supabase
        .from("order_reasons")
        .delete()
        .eq("id", id)
        .eq("is_system", false);
    if (error) throw error;
}

export async function reorderOrderReasons(orderedIds: string[]): Promise<void> {
    await Promise.all(
        orderedIds.map((id, index) =>
            supabase.from("order_reasons").update({ sort_order: index + 1 }).eq("id", id),
        ),
    );
}

export interface ReasonUsage {
    counts: Record<string, number>;
    total: number;
}

export async function fetchReasonUsage(tenantId: string, kind: ReasonKind): Promise<ReasonUsage> {
    const status = kind === "reject" ? "rejected" : "cancelled";
    try {
        type UsageRow = { reason_id: string | null; rejection_reason: string | null };
        const { data, error } = await supabase
            .from("orders")
            .select("reason_id, rejection_reason")
            .eq("tenant_id", tenantId)
            .eq("status", status);
        if (error) throw error;
        const rows = (data ?? []) as UsageRow[];

        const counts: Record<string, number> = {};
        let total = 0;
        for (const row of rows) {
            const id = row.reason_id;
            const text = row.rejection_reason?.trim();
            const key = id ? `id:${id}` : text ? `label:${text}` : null;
            if (!key) continue;
            counts[key] = (counts[key] || 0) + 1;
            total += 1;
        }
        return { counts, total };
    } catch {
        return { counts: {}, total: 0 };
    }
}

export function reasonUsageCount(
    usage: ReasonUsage | undefined,
    reason: Pick<OrderReason, "id" | "label_ar" | "aliases">,
): number {
    if (!usage) return 0;
    let n = (usage.counts[`id:${reason.id}`] || 0) + (usage.counts[`label:${reason.label_ar}`] || 0);
    for (const alias of reason.aliases ?? []) {
        if (alias && alias !== reason.label_ar) n += usage.counts[`label:${alias}`] || 0;
    }
    return n;
}
