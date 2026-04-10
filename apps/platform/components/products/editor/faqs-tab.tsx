"use client";

import { useState } from "react";
import { HelpCircle, Plus, Trash2, ChevronDown } from "lucide-react";

export interface FaqFormData {
    question: string;
    answer: string;
    display_order: number;
}

interface FaqsTabProps {
    faqs: FaqFormData[];
    onChange: (faqs: FaqFormData[]) => void;
}

export function FaqsTab({ faqs, onChange }: FaqsTabProps) {
    const [expandedPreview, setExpandedPreview] = useState<number | null>(null);

    const addFaq = () => {
        onChange([
            ...faqs,
            { question: "", answer: "", display_order: faqs.length },
        ]);
    };

    const updateFaq = (index: number, updates: Partial<FaqFormData>) => {
        const updated = faqs.map((f, i) =>
            i === index ? { ...f, ...updates } : f
        );
        onChange(updated);
    };

    const removeFaq = (index: number) => {
        const updated = faqs
            .filter((_, i) => i !== index)
            .map((f, i) => ({ ...f, display_order: i }));
        onChange(updated);
    };

    const togglePreview = (index: number) => {
        setExpandedPreview(expandedPreview === index ? null : index);
    };

    // Only show FAQs with content in preview
    const previewFaqs = faqs.filter((f) => f.question.trim() || f.answer.trim());

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={addFaq}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add FAQ
                </button>
            </div>

            {/* Empty state */}
            {faqs.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <HelpCircle className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No FAQs added. Answer common customer questions to reduce support inquiries.
                    </p>
                </div>
            ) : (
                <>
                    {/* Edit cards */}
                    <div className="space-y-3">
                        {faqs.map((faq, index) => (
                            <div
                                key={index}
                                className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4 space-y-3 relative"
                            >
                                {/* Delete button */}
                                <button
                                    type="button"
                                    onClick={() => removeFaq(index)}
                                    className="absolute top-3 right-3 p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>

                                {/* Question */}
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        Question
                                    </label>
                                    <input
                                        type="text"
                                        value={faq.question}
                                        onChange={(e) =>
                                            updateFaq(index, { question: e.target.value })
                                        }
                                        placeholder="e.g. What is the return policy?"
                                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>

                                {/* Answer */}
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        Answer
                                    </label>
                                    <textarea
                                        value={faq.answer}
                                        onChange={(e) =>
                                            updateFaq(index, { answer: e.target.value })
                                        }
                                        placeholder="Provide a clear, helpful answer..."
                                        rows={3}
                                        className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] resize-none"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Accordion preview */}
                    {previewFaqs.length > 0 && (
                        <div className="space-y-1">
                            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                Preview
                            </h3>
                            <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] px-4">
                                {previewFaqs.map((faq, index) => (
                                    <div
                                        key={index}
                                        className="border-b border-[var(--card-border)] py-3 cursor-pointer last:border-b-0"
                                    >
                                        <div
                                            onClick={() => togglePreview(index)}
                                            className="text-sm font-medium text-foreground flex items-center justify-between"
                                        >
                                            <span>{faq.question || "Untitled question"}</span>
                                            <ChevronDown
                                                className={`w-4 h-4 text-muted transition-transform shrink-0 ml-2 ${
                                                    expandedPreview === index ? "rotate-180" : ""
                                                }`}
                                            />
                                        </div>
                                        {expandedPreview === index && faq.answer && (
                                            <p className="text-sm text-muted mt-2">
                                                {faq.answer}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
