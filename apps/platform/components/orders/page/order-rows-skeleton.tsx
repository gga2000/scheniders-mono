/**
 * Grey outlines where the orders will land while they load (board O3). Same
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
                        ? "w-full h-24 animate-pulse bg-muted/20 rounded-2xl"
                        : "w-full h-12 animate-pulse bg-muted/20 rounded-xl"}
                />
            ))}
        </div>
    );
}
