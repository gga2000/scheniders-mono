"use client";

import Link from "next/link";
import { LayoutGrid, ArrowRight } from "lucide-react";
import type { PageId, StoreConfigV2 } from "@scheniders/shared";

interface PagesCardProps {
    config: StoreConfigV2 | null;
}

const PAGE_LABELS: Record<PageId, string> = {
    home: "Home",
    category: "Category",
    product: "Product page",
    search: "Search",
    cart: "Cart",
    checkout: "Checkout",
    checkout_success: "Order confirmed",
    track: "Track order",
    about: "About",
    faq: "FAQ",
    contact: "Contact",
    policy_shipping: "Shipping policy",
    policy_returns: "Returns policy",
    policy_privacy: "Privacy policy",
    policy_terms: "Terms of service",
    not_found: "404 page",
};

export function PagesCard({ config }: PagesCardProps) {
    const pages = config?.pages ?? [];

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <LayoutGrid className="w-4 h-4 text-violet-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Pages</h3>
                <span className="ml-auto text-xs text-muted-foreground">{pages.length} pages</span>
            </div>

            {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                    No pages configured. Open the editor to start.
                </p>
            ) : (
                <div className="space-y-1.5">
                    {pages.map((page) => (
                        <div
                            key={page.page_id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors group"
                        >
                            <span className="text-sm font-medium text-foreground flex-1">
                                {PAGE_LABELS[page.page_id] ?? page.page_id}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                {page.sections.length} section{page.sections.length !== 1 ? "s" : ""}
                            </span>
                            <Link
                                href={`/store/edit?page=${page.page_id}`}
                                className="text-[11px] font-semibold text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all flex items-center gap-0.5"
                            >
                                Edit <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
