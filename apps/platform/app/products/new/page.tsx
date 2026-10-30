"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProductEditorPage } from "@/components/products/editor/product-editor-page";

export default function NewProductPage() {
    return (
        <Suspense fallback={<EditorSkeleton />}>
            <NewProductEditor />
        </Suspense>
    );
}

/** `?supply=1` comes from the Supplies tab's Add button. */
function NewProductEditor() {
    const searchParams = useSearchParams();
    return <ProductEditorPage product={null} mode="create" defaultIsSupply={searchParams.get("supply") === "1"} />;
}

function EditorSkeleton() {
    return (
        <div className="min-h-screen bg-[var(--background)]">
            <div className="sticky top-0 z-30 bg-[var(--background)] border-b border-[var(--card-border)]">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-[var(--card-border)] animate-pulse" />
                        <div className="w-48 h-6 rounded-lg bg-[var(--card-border)] animate-pulse" />
                    </div>
                    <div className="w-32 h-10 rounded-xl bg-[var(--card-border)] animate-pulse" />
                </div>
            </div>
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="flex-1 space-y-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
                                <div className="w-32 h-4 rounded bg-[var(--card-border)] animate-pulse mb-4" />
                                <div className="space-y-3">
                                    <div className="w-full h-10 rounded-xl bg-[var(--card-border)] animate-pulse" />
                                    <div className="w-full h-10 rounded-xl bg-[var(--card-border)] animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="w-full lg:w-80">
                        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
                            <div className="w-20 h-4 rounded bg-[var(--card-border)] animate-pulse mb-4" />
                            <div className="w-full h-10 rounded-xl bg-[var(--card-border)] animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
