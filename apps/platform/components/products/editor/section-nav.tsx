"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    Package,
    DollarSign,
    Image,
    Globe,
    Box,
    Layers,
    Settings,
    FileText,
    Eye,
    Tags,
} from "lucide-react";

export interface SectionDef {
    id: string;
    labelKey: string;
    icon: React.ElementType;
    visible?: boolean;
}

const SECTIONS: SectionDef[] = [
    { id: "type", labelKey: "products.editor.nav.type", icon: Box },
    { id: "basic", labelKey: "products.editor.nav.basic", icon: Package },
    { id: "media", labelKey: "products.editor.nav.media", icon: Image },
    { id: "pricing", labelKey: "products.editor.nav.pricing", icon: DollarSign },
    { id: "variants", labelKey: "products.editor.nav.variants", icon: Layers },
    { id: "storefront", labelKey: "products.editor.nav.storefront", icon: Globe },
    { id: "attributes", labelKey: "products.editor.nav.attributes", icon: Tags },
    { id: "inventory", labelKey: "products.editor.nav.inventory", icon: Box },
    { id: "cms", labelKey: "products.editor.nav.cms", icon: FileText },
    { id: "preview", labelKey: "products.editor.nav.preview", icon: Eye },
    { id: "advanced", labelKey: "products.editor.nav.advanced", icon: Settings },
];

interface SectionNavProps {
    visibleSections?: string[];
}

export function SectionNav({ visibleSections }: SectionNavProps) {
    const { t } = useLanguage();
    const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
    const observerRef = useRef<IntersectionObserver | null>(null);

    const filteredSections = visibleSections
        ? SECTIONS.filter((s) => visibleSections.includes(s.id))
        : SECTIONS;

    // Track which section is in view using IntersectionObserver
    useEffect(() => {
        const elements = filteredSections
            .map((s) => document.getElementById(`section-${s.id}`))
            .filter(Boolean) as HTMLElement[];

        if (elements.length === 0) return;

        observerRef.current = new IntersectionObserver(
            (entries) => {
                // Find the topmost visible section
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort(
                        (a, b) =>
                            a.boundingClientRect.top - b.boundingClientRect.top
                    );

                if (visible.length > 0) {
                    const id = visible[0].target.id.replace("section-", "");
                    setActiveSection(id);
                }
            },
            {
                rootMargin: "0px 0px -80% 0px",
                threshold: 0,
            }
        );

        elements.forEach((el) => observerRef.current?.observe(el));

        return () => {
            observerRef.current?.disconnect();
        };
    }, [filteredSections]);

    const scrollToSection = (id: string) => {
        const el = document.getElementById(`section-${id}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setActiveSection(id);
        }
    };

    return (
        <>
            {/* Desktop: Vertical sidebar nav */}
            <nav className="hidden xl:block w-48 shrink-0">
                <div className="sticky top-24 space-y-0.5">
                    {filteredSections.map((section) => {
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => scrollToSection(section.id)}
                                aria-current={isActive ? "location" : undefined}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                                    isActive
                                        ? "bg-[var(--pastel-yellow)] text-amber-900 font-semibold"
                                        : "text-muted hover:text-foreground hover:bg-[var(--background)]"
                                )}
                            >
                                <Icon
                                    className={cn(
                                        "w-4 h-4 shrink-0",
                                        isActive
                                            ? "text-amber-700"
                                            : "text-muted"
                                    )}
                                />
                                <span className="truncate">
                                    {t(section.labelKey)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* Mobile: Horizontal scrollable tab bar */}
            <div className="xl:hidden sticky top-[65px] z-20 bg-[var(--background)] border-b border-[var(--card-border)] -mx-6 px-6">
                <div className="flex overflow-x-auto scrollbar-hide gap-1 py-2">
                    {filteredSections.map((section) => {
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => scrollToSection(section.id)}
                                aria-current={isActive ? "location" : undefined}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 min-h-[44px]",
                                    isActive
                                        ? "bg-[var(--pastel-yellow)] text-amber-900"
                                        : "text-muted hover:text-foreground hover:bg-[var(--background)]"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {t(section.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
