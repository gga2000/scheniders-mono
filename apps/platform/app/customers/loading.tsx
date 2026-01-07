import { PageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* Customized skeleton for customers if needed, for now reusing generic PageSkeleton */}
            <PageSkeleton />
        </div>
    );
}
