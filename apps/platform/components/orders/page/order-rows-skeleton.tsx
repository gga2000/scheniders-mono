/**
 * One loading outline, in the cards' own white and border. A fill of the
 * page's soft background at 20% could not be seen on prod.
 */
export const SKELETON_BLOCK = "animate-pulse bg-[var(--card-bg)] border border-[var(--card-border)]";

/**
 * Card outlines where the orders will land while they load (board O3). Same
 * spots as the cards or table rows, so nothing jumps when the list arrives;
 * the cards themselves are unchanged.
 */

export function OrderRowsSkeleton({ variant }: { variant: "cards" | "table" }) {
    return (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
            {[0, 1, 2, 3].map(i => (
                <div
                    key={i}
                    className={variant === "cards"
                        ? `w-full h-24 rounded-2xl ${SKELETON_BLOCK}`
                        : `w-full h-12 rounded-xl ${SKELETON_BLOCK}`}
                />
            ))}
        </div>
    );
}
