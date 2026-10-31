"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useLanguage } from "@/hooks/use-language";
import { ProductEditorPage } from "@/components/products/editor/product-editor-page";

export default function EditProductPage() {
    return (
        <Suspense fallback={<EditorSkeleton />}>
            <EditProductContent />
        </Suspense>
    );
}

function EditProductContent() {
    const params = useParams();
    const router = useRouter();
    const productId = params.id as string;
    const { products, loading, pending, error } = useProductsCrud({ withSales: true });
    const { t } = useLanguage();

    const product = products.find((p) => p.id === productId);

    if (loading || (pending && !error)) {
        return <EditorSkeleton />;
    }

    if (!product && error) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-foreground mb-2">{t("products.editor.loadFailed")}</h2>
                    <p className="text-muted mb-4">{t("products.editor.loadFailedHint")}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        {t("products.editor.retry")}
                    </button>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-foreground mb-2">{t("products.editor.notFound")}</h2>
                    <p className="text-muted mb-4">{t("products.editor.notFoundHint")}</p>
                    <button
                        onClick={() => router.push("/products")}
                        className="px-6 py-3 bg-[var(--ink)] text-white rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                        {t("products.editor.backToProducts")}
                    </button>
                </div>
            </div>
        );
    }

    return <ProductEditorPage product={product} mode="edit" />;
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
