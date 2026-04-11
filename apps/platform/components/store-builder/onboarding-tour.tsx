"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
    target: string; // data-tour-id value
    title: string;
    description: string;
    position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
    {
        target: "template-picker",
        title: "Choose Your Template",
        description: "Pick a template that matches your brand. You can change it anytime.",
        position: "bottom",
    },
    {
        target: "branding-editor",
        title: "Customize Your Brand",
        description: "Set your colors, fonts, and logo to make the store uniquely yours.",
        position: "bottom",
    },
    {
        target: "hero-editor",
        title: "Design Your Hero Banner",
        description: "Add a catchy title, subtitle, and hero image to welcome visitors.",
        position: "bottom",
    },
    {
        target: "section-manager",
        title: "Manage Page Sections",
        description: "Drag to reorder, toggle to show/hide, and add new sections like testimonials or FAQ.",
        position: "bottom",
    },
    {
        target: "seo-editor",
        title: "Optimize for Search Engines",
        description: "Set your meta title and description so customers can find you on Google.",
        position: "top",
    },
];

function getStorageKey(tenantId: string) {
    return `store-builder-tour-seen-${tenantId}`;
}

interface OnboardingTourProps {
    tenantId: string;
}

export function OnboardingTour({ tenantId }: OnboardingTourProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [visible, setVisible] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Check if tour has been seen
    useEffect(() => {
        const key = getStorageKey(tenantId);
        const seen = localStorage.getItem(key);
        if (!seen) {
            // Small delay to let the page render
            const timer = setTimeout(() => setVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, [tenantId]);

    // Position the tooltip relative to the target element
    useEffect(() => {
        if (!visible) return;

        const step = TOUR_STEPS[currentStep];
        const targetEl = document.querySelector(`[data-tour-id="${step.target}"]`);
        if (!targetEl) return;

        const rect = targetEl.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;

        // Scroll target into view
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

        // Recalculate after scroll
        requestAnimationFrame(() => {
            const newRect = targetEl.getBoundingClientRect();
            const tooltipWidth = 320;
            const gap = 12;

            let top = 0;
            let left = 0;

            switch (step.position) {
                case "bottom":
                    top = newRect.bottom + gap;
                    left = newRect.left + newRect.width / 2 - tooltipWidth / 2;
                    break;
                case "top":
                    top = newRect.top - gap - 140; // approx tooltip height
                    left = newRect.left + newRect.width / 2 - tooltipWidth / 2;
                    break;
                case "left":
                    top = newRect.top + newRect.height / 2 - 70;
                    left = newRect.left - tooltipWidth - gap;
                    break;
                case "right":
                    top = newRect.top + newRect.height / 2 - 70;
                    left = newRect.right + gap;
                    break;
            }

            // Clamp to viewport
            left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
            top = Math.max(16, top);

            setTooltipPos({ top, left });
        });
    }, [visible, currentStep]);

    const dismiss = useCallback(() => {
        setVisible(false);
        localStorage.setItem(getStorageKey(tenantId), "true");
    }, [tenantId]);

    const next = useCallback(() => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep((s) => s + 1);
        } else {
            dismiss();
        }
    }, [currentStep, dismiss]);

    const prev = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep((s) => s - 1);
        }
    }, [currentStep]);

    if (!visible) return null;

    const step = TOUR_STEPS[currentStep];
    const isLast = currentStep === TOUR_STEPS.length - 1;

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 z-[60] bg-black/30 pointer-events-none" role="presentation" aria-hidden="true" />

            {/* Tooltip */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep}
                    ref={tooltipRef}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="fixed z-[61] w-80 p-4 rounded-2xl bg-(--card-bg) border border-(--card-border) shadow-2xl"
                    style={{ top: tooltipPos.top, left: tooltipPos.left }}
                >
                    {/* Close button */}
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Close tour"
                        className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>

                    {/* Content */}
                    <p className="text-sm font-semibold mb-1">{step.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                        {step.description}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                        {/* Step indicator */}
                        <div className="flex items-center gap-1" role="tablist" aria-label="Tour progress">
                            {TOUR_STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    role="tab"
                                    aria-selected={i === currentStep}
                                    aria-label={`Step ${i + 1} of ${TOUR_STEPS.length}`}
                                    className={cn(
                                        "w-1.5 h-1.5 rounded-full transition-colors",
                                        i === currentStep ? "bg-primary" : "bg-muted/40"
                                    )}
                                />
                            ))}
                        </div>

                        {/* Navigation */}
                        <div className="flex items-center gap-2">
                            {currentStep > 0 && (
                                <button
                                    type="button"
                                    onClick={prev}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                    Back
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={next}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                {isLast ? "Got it!" : "Next"}
                                {!isLast && <ChevronRight className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </>
    );
}
