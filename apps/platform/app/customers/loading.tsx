import { CustomerSplitPaneSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <CustomerSplitPaneSkeleton />
        </div>
    );
}
