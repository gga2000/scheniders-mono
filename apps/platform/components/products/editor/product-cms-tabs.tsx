"use client";

import { useState } from "react";
import { Sparkles, HelpCircle, Quote, MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FeaturesTab } from "./features-tab";
import { FaqsTab } from "./faqs-tab";
import { TestimonialsTab } from "./testimonials-tab";
import { ReviewsTab } from "./reviews-tab";
import type { FeatureFormData } from "./features-tab";
import type { FaqFormData } from "./faqs-tab";
import type { TestimonialFormData } from "./testimonials-tab";
import type { ReviewFormData } from "./reviews-tab";

interface ProductCMSTabsProps {
    features: FeatureFormData[];
    onFeaturesChange: (features: FeatureFormData[]) => void;
    faqs: FaqFormData[];
    onFaqsChange: (faqs: FaqFormData[]) => void;
    testimonials: TestimonialFormData[];
    onTestimonialsChange: (testimonials: TestimonialFormData[]) => void;
    reviews: ReviewFormData[];
    onReviewsChange: (reviews: ReviewFormData[]) => void;
}

const tabs = [
    { id: "features", label: "Features", icon: Sparkles },
    { id: "faqs", label: "FAQs", icon: HelpCircle },
    { id: "testimonials", label: "Testimonials", icon: Quote },
    { id: "reviews", label: "Reviews", icon: MessageSquare },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function ProductCMSTabs({
    features,
    onFeaturesChange,
    faqs,
    onFaqsChange,
    testimonials,
    onTestimonialsChange,
    reviews,
    onReviewsChange,
}: ProductCMSTabsProps) {
    const [activeTab, setActiveTab] = useState<TabId>("features");

    const counts: Record<TabId, number> = {
        features: features.length,
        faqs: faqs.length,
        testimonials: testimonials.length,
        reviews: reviews.length,
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            {/* Tab header */}
            <div className="flex border-b border-[var(--card-border)] bg-[var(--background)]">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 flex items-center gap-2 text-sm transition-colors cursor-pointer relative ${
                                isActive
                                    ? "border-b-2 border-[var(--foreground)] text-foreground font-medium"
                                    : "text-muted hover:text-foreground"
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[var(--card-border)] text-muted">
                                {counts[tab.id]}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div className="p-6">
                <AnimatePresence mode="wait">
                    {activeTab === "features" && (
                        <motion.div
                            key="features"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.15 }}
                        >
                            <FeaturesTab
                                features={features}
                                onChange={onFeaturesChange}
                            />
                        </motion.div>
                    )}
                    {activeTab === "faqs" && (
                        <motion.div
                            key="faqs"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.15 }}
                        >
                            <FaqsTab faqs={faqs} onChange={onFaqsChange} />
                        </motion.div>
                    )}
                    {activeTab === "testimonials" && (
                        <motion.div
                            key="testimonials"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.15 }}
                        >
                            <TestimonialsTab
                                testimonials={testimonials}
                                onChange={onTestimonialsChange}
                            />
                        </motion.div>
                    )}
                    {activeTab === "reviews" && (
                        <motion.div
                            key="reviews"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.15 }}
                        >
                            <ReviewsTab
                                reviews={reviews}
                                onChange={onReviewsChange}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
