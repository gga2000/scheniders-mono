import type { OrderStatus } from "@/lib/supabase";

/**
 * Statuses an operator can pick from the table's status dropdown and the
 * row right-click menu, in pipeline order, with each one's dot colour.
 * Labels come from `getOrderStatusLabel` so they follow the UI language.
 */
export const TABLE_STATUS_OPTIONS: ReadonlyArray<{ value: OrderStatus; dot: string }> = [
    { value: "new", dot: "bg-orange-400" },
    { value: "contacted", dot: "bg-yellow-400" },
    { value: "confirmed", dot: "bg-green-400" },
    { value: "in_transit", dot: "bg-blue-400" },
    { value: "delivered", dot: "bg-teal-400" },
    { value: "completed", dot: "bg-emerald-400" },
    { value: "no_response", dot: "bg-gray-400" },
    { value: "suspended", dot: "bg-orange-300" },
    { value: "rejected", dot: "bg-rose-400" },
    { value: "cancelled", dot: "bg-red-400" },
];
