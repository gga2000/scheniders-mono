/** Same placeholder grid the customers page shows while its first page loads. */
export default function Loading() {
    return (
        <div className="min-h-screen bg-background px-4 py-6 md:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-6 h-44 animate-pulse" />
                ))}
            </div>
        </div>
    );
}
