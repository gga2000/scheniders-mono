/** Shared visual for every 40px round icon control in the header action cluster.
 *  One source of truth so the cluster never drifts in size or border again. */
export const HEADER_ACTION_CLASS =
    "w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] " +
    "flex items-center justify-center text-muted hover:text-foreground " +
    "hover:border-[var(--foreground-muted)] transition-all";
