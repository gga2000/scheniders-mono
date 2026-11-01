"use client";

import { Store, Truck, FileSpreadsheet } from "lucide-react";
import type { Order } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

export function SourceBadge({ source }: { source: Order["source"] }) {
    const { t } = useLanguage();
    if (!source) return null;

    switch (source) {
        case "whatsapp":
            return (
                <span className="inline-flex h-6 items-center gap-1.5 px-2 text-[11px] font-semibold rounded-full bg-green-100 text-green-700">
                    {/* WhatsApp official logo - green circle with phone */}
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#25D366">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                </span>
            );
        case "lightfunnels":
            return (
                <span className="inline-flex h-6 items-center gap-1.5 px-2 text-[11px] font-semibold rounded-full bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 text-purple-700 border border-purple-200">
                    {/* LightFunnels logo - colorful arrow shape */}
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <path d="M3 21L9 3L15 15L21 3" stroke="url(#lf-gradient-badge)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        <defs>
                            <linearGradient id="lf-gradient-badge" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#EC4899" />
                                <stop offset="0.5" stopColor="#8B5CF6" />
                                <stop offset="1" stopColor="#3B82F6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    LightFunnels
                </span>
            );
        case "meta":
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white">
                    {/* Instagram logo */}
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                    Instagram
                </span>
            );
        case "other":
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                    {/* Globe icon */}
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    {t("orders.source.other")}
                </span>
            );
        case "tiktok":
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-gray-900 text-white">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                    </svg>
                    TikTok
                </span>
            );
        case "shop":
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-[var(--pastel-yellow)] text-amber-900 border border-[var(--primary)]/30 dark:bg-[#EFFF00]/20 dark:text-[#EFFF00] dark:border-[#EFFF00]/30">
                    <Store className="w-3 h-3" />
                    {t("orders.card.shopOrder")}
                </span>
            );
        case "prime":
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-indigo-100 text-indigo-700">
                    <Truck className="w-3 h-3" />
                    Prime
                </span>
            );
        case "excel_import":
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold rounded-full bg-sky-100 text-sky-700">
                    <FileSpreadsheet className="w-3 h-3" />
                    {t("orders.source.excel")}
                </span>
            );
        default:
            return null;
    }
}
