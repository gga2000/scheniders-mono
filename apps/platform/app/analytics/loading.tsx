import { PageSkeleton } from "@scheniders/ui/skeletons";

export default function Loading() {
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <PageSkeleton />
        </div>
    );
}
