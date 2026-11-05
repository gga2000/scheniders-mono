/**
 * Scent helper: find bottles by scent note, and ones like a bottle the
 * customer liked. Notes come from a fixed list (products.scent_notes check).
 */
import type { TillProduct } from "./cart";

export const SCENT_NOTES = ["oud", "woody", "fresh", "citrus", "sweet", "vanilla", "floral", "spicy", "musky", "amber", "leather", "aquatic", "fruity", "smoky"] as const;
export type ScentNote = (typeof SCENT_NOTES)[number];
export const MAX_NOTES = 6;

export function isScentNote(n: string): n is ScentNote {
    return (SCENT_NOTES as readonly string[]).includes(n);
}

function shared(a: readonly string[], b: ReadonlySet<string>): number {
    return a.reduce((n, x) => n + (b.has(x) ? 1 : 0), 0);
}

/** Bottles with any of the notes, most notes in common first (name order on ties kept). */
export function byNotes(products: TillProduct[], notes: readonly string[]): TillProduct[] {
    if (notes.length === 0) return products.filter((p) => p.notes.length > 0);
    const want = new Set(notes);
    return products
        .map((p, i) => ({ p, i, n: shared(p.notes, want) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n || a.i - b.i)
        .map((x) => x.p);
}

/** Other bottles sharing notes with this one, closest first. */
export function similarTo(products: TillProduct[], product: TillProduct): TillProduct[] {
    if (product.notes.length === 0) return [];
    return byNotes(
        products.filter((p) => p.id !== product.id),
        product.notes,
    );
}

/** Notes in use across the shelf, most used first, in list order on ties. */
export function notesInUse(products: TillProduct[]): { note: ScentNote; count: number }[] {
    return SCENT_NOTES.map((note) => ({ note, count: products.filter((p) => p.notes.includes(note)).length }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count);
}
