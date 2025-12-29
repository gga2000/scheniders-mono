"use client";

export default function OfflinePage() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                {/* Offline Icon */}
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
                    <svg
                        className="w-12 h-12 text-amber-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                        />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-foreground mb-2">
                    أنت غير متصل بالإنترنت
                </h1>

                {/* Description */}
                <p className="text-muted-foreground mb-8">
                    يبدو أنك غير متصل بالإنترنت. سيتم مزامنة البيانات تلقائياً عند استعادة الاتصال.
                </p>

                {/* Retry Button */}
                <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                    إعادة المحاولة
                </button>

                {/* Info */}
                <p className="text-sm text-muted-foreground mt-6">
                    يمكنك الاطلاع على البيانات المخزنة مؤقتاً في وضع عدم الاتصال
                </p>
            </div>
        </div>
    );
}
