/** The summary's shape while its figures load: the dark strip, then the cards. */
export function SummarySkeleton() {
    const card = "animate-pulse rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]";
    return (
        <div className="space-y-5" aria-busy="true" data-testid="summary-loading">
            <div className="flex h-[124px] items-center gap-8 rounded-2xl bg-stone-900 px-6 dark:bg-[#1d1c1a]">
                <div className="space-y-3">
                    <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
                    <div className="h-9 w-56 animate-pulse rounded bg-white/15" />
                </div>
                {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex-1 space-y-2.5 border-s border-white/10 ps-5">
                        <div className="h-2.5 w-16 animate-pulse rounded bg-white/10" />
                        <div className="h-5 w-24 animate-pulse rounded bg-white/15" />
                    </div>
                ))}
            </div>
            <div className={`${card} h-[380px]`} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <div className={`${card} h-[400px]`} />
                <div className={`${card} h-[400px]`} />
            </div>
            <div className={`${card} h-[300px]`} />
        </div>
    );
}
