/**
 * Deterministic pastel color derived from a category id.
 * Used to give product cards a stable, per-category visual accent so
 * the grid is scannable without reading category chips.
 *
 * Approach: simple 32-bit string hash → hue (0-360), fixed S=55%, L=65%.
 * Uncategorized products get a neutral gray.
 */
export function getCategoryColor(categoryId: string | null | undefined): string {
    if (!categoryId) {
        // Neutral gray for uncategorized — matches card-border tone.
        return "hsl(0, 0%, 80%)";
    }
    let hash = 0;
    for (let i = 0; i < categoryId.length; i++) {
        hash = (hash * 31 + categoryId.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 65%)`;
}
