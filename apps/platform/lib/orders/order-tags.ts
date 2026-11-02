import { z } from "zod";

/** The database enum `tag_color`, in picker order. */
export const ORDER_TAG_COLORS = ["blue", "green", "yellow", "orange", "red", "pink", "purple", "gray"] as const;
export type TagColor = (typeof ORDER_TAG_COLORS)[number];

export const OrderTagSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    color: z.enum(ORDER_TAG_COLORS),
});
export type OrderTag = z.infer<typeof OrderTagSchema>;

export const ORDER_TAG_NAME_MAX = 24;

/** Chip classes per colour, light and dark. */
export const ORDER_TAG_TONE: Record<TagColor, string> = {
    blue: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-400/15 dark:text-blue-200 dark:border-blue-400/30",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:border-emerald-400/30",
    yellow: "bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-400/15 dark:text-yellow-200 dark:border-yellow-400/30",
    orange: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-400/15 dark:text-orange-200 dark:border-orange-400/30",
    red: "bg-red-50 text-red-800 border-red-200 dark:bg-red-400/15 dark:text-red-200 dark:border-red-400/30",
    pink: "bg-pink-50 text-pink-800 border-pink-200 dark:bg-pink-400/15 dark:text-pink-200 dark:border-pink-400/30",
    purple: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-400/15 dark:text-violet-200 dark:border-violet-400/30",
    gray: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-200 dark:border-white/15",
};

/** Solid swatch per colour, for the colour picker and dots. */
export const ORDER_TAG_SWATCH: Record<TagColor, string> = {
    blue: "bg-blue-500", green: "bg-emerald-500", yellow: "bg-yellow-400", orange: "bg-orange-500",
    red: "bg-red-500", pink: "bg-pink-500", purple: "bg-violet-500", gray: "bg-slate-400",
};

/** The order's tags in the store's order (alphabetical), skipping ids no longer defined. */
export function tagsOf(tagIds: readonly string[] | null | undefined, tags: readonly OrderTag[]): OrderTag[] {
    if (!tagIds || tagIds.length === 0) return [];
    const wanted = new Set(tagIds);
    return tags.filter((t) => wanted.has(t.id));
}

/** Add the tag when missing, remove it when present. */
export function toggleTagId(tagIds: readonly string[] | null | undefined, tagId: string): string[] {
    const current = tagIds ?? [];
    return current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
}

/** A trimmed, length-capped name, or null when it would be empty or a duplicate (case-insensitive). */
export function cleanTagName(raw: string, existing: readonly OrderTag[], exceptId?: string): string | null {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, ORDER_TAG_NAME_MAX);
    if (!name) return null;
    const lower = name.toLocaleLowerCase();
    if (existing.some((t) => t.id !== exceptId && t.name.toLocaleLowerCase() === lower)) return null;
    return name;
}

/** The first colour no tag uses yet, so new tags look different; cycles once all are taken. */
export function nextTagColor(existing: readonly OrderTag[]): TagColor {
    const used = new Set(existing.map((t) => t.color));
    return ORDER_TAG_COLORS.find((c) => !used.has(c)) ?? ORDER_TAG_COLORS[existing.length % ORDER_TAG_COLORS.length];
}
