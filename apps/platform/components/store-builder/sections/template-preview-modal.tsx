"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateName } from "@scheniders/shared";

interface TemplatePreviewModalProps {
    open: boolean;
    onClose: () => void;
    template: TemplateName;
    currentTemplate: TemplateName;
    onApply: (template: TemplateName) => void;
    businessName: string;
}

const TEMPLATE_PREVIEWS: Record<TemplateName, {
    name: string;
    description: string;
    gradient: string;
    features: string[];
}> = {
    fashion: {
        name: "Fashion",
        description: "Bold imagery and elegant typography for fashion and apparel stores.",
        gradient: "from-rose-500 to-pink-600",
        features: ["Full-bleed hero images", "Product carousel", "Lookbook-style layout", "Minimal navigation"],
    },
    beauty: {
        name: "Beauty",
        description: "Soft aesthetics with pastel accents for beauty and cosmetics.",
        gradient: "from-fuchsia-400 to-purple-500",
        features: ["Soft color palette", "Before/after sections", "Review highlights", "Ingredient showcases"],
    },
    electronics: {
        name: "Electronics",
        description: "Tech-forward design with sharp edges for electronics and gadgets.",
        gradient: "from-blue-500 to-indigo-600",
        features: ["Spec comparison cards", "Feature highlights", "Dark header option", "Grid product display"],
    },
    general: {
        name: "General",
        description: "A versatile template that works for any type of store.",
        gradient: "from-emerald-500 to-teal-600",
        features: ["Flexible sections", "Category navigation", "Hero with CTA", "Clean product grid"],
    },
    clean: {
        name: "Clean",
        description: "Minimalist design focused on products and content.",
        gradient: "from-zinc-600 to-zinc-800",
        features: ["Maximum whitespace", "Typography-focused", "Subtle animations", "Content-first approach"],
    },
};

export function TemplatePreviewModal({
    open,
    onClose,
    template,
    currentTemplate,
    onApply,
    businessName,
}: TemplatePreviewModalProps) {
    const preview = TEMPLATE_PREVIEWS[template];
    const isActive = template === currentTemplate;

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60"
                    />

                    {/* Modal */}
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${preview.name} template preview`}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-2xl mx-4 bg-(--card-bg) rounded-2xl border border-(--card-border) shadow-2xl overflow-hidden"
                    >
                        {/* Preview area */}
                        <div className={cn("h-64 bg-gradient-to-br", preview.gradient, "relative")}>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-8">
                                <p className="text-sm font-medium opacity-70 mb-2">{preview.name} Template</p>
                                <h2 className="text-3xl font-bold mb-2">{businessName}</h2>
                                <p className="text-sm opacity-80">Preview of how your store would look</p>
                            </div>

                            {/* Close button */}
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close template preview"
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Details */}
                        <div className="p-6">
                            <h3 className="text-lg font-bold mb-2">{preview.name}</h3>
                            <p className="text-sm text-muted-foreground mb-4">{preview.description}</p>

                            <div className="grid grid-cols-2 gap-2 mb-6">
                                {preview.features.map((feature) => (
                                    <div key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Check className="w-3 h-3 text-green-500 shrink-0" />
                                        {feature}
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApply(template);
                                        onClose();
                                    }}
                                    disabled={isActive}
                                    className={cn(
                                        "flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                                        isActive
                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default"
                                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                                    )}
                                >
                                    {isActive ? "Currently Active" : "Apply Template"}
                                </button>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2.5 rounded-xl text-sm font-medium border border-(--card-border) text-muted-foreground hover:bg-muted/30 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
