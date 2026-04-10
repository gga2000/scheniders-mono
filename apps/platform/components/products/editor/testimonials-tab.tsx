"use client";

import { useRef } from "react";
import { Quote, Plus, Trash2, User } from "lucide-react";
import { Star } from "lucide-react";
import { StarRatingInput } from "./star-rating-input";

export interface TestimonialFormData {
    customer_name: string;
    customer_photo_url: string;
    rating: number;
    quote: string;
    is_featured: boolean;
    display_order: number;
}

interface TestimonialsTabProps {
    testimonials: TestimonialFormData[];
    onChange: (testimonials: TestimonialFormData[]) => void;
}

export function TestimonialsTab({ testimonials, onChange }: TestimonialsTabProps) {
    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const addTestimonial = () => {
        onChange([
            ...testimonials,
            {
                customer_name: "",
                customer_photo_url: "",
                rating: 5,
                quote: "",
                is_featured: false,
                display_order: testimonials.length,
            },
        ]);
    };

    const updateTestimonial = (index: number, updates: Partial<TestimonialFormData>) => {
        const updated = testimonials.map((t, i) =>
            i === index ? { ...t, ...updates } : t
        );
        onChange(updated);
    };

    const removeTestimonial = (index: number) => {
        const updated = testimonials
            .filter((_, i) => i !== index)
            .map((t, i) => ({ ...t, display_order: i }));
        onChange(updated);
    };

    const handlePhotoSelect = (index: number, file: File) => {
        const url = URL.createObjectURL(file);
        updateTestimonial(index, { customer_photo_url: url });
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={addTestimonial}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Testimonial
                </button>
            </div>

            {/* Empty state */}
            {testimonials.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Quote className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No testimonials added. Add customer quotes to build trust and credibility.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {testimonials.map((testimonial, index) => (
                        <div
                            key={index}
                            className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4 space-y-3"
                        >
                            {/* Top row */}
                            <div className="flex items-center gap-3">
                                {/* Photo avatar */}
                                <button
                                    type="button"
                                    onClick={() => fileInputRefs.current[index]?.click()}
                                    className="w-12 h-12 rounded-full shrink-0 overflow-hidden border-0 bg-[var(--card-border)] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                                >
                                    {testimonial.customer_photo_url ? (
                                        <img
                                            src={testimonial.customer_photo_url}
                                            alt=""
                                            className="w-12 h-12 rounded-full object-cover"
                                        />
                                    ) : (
                                        <User className="w-5 h-5 text-muted" />
                                    )}
                                </button>
                                <input
                                    ref={(el) => {
                                        fileInputRefs.current[index] = el;
                                    }}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePhotoSelect(index, file);
                                    }}
                                />

                                {/* Customer name */}
                                <input
                                    type="text"
                                    value={testimonial.customer_name}
                                    onChange={(e) =>
                                        updateTestimonial(index, { customer_name: e.target.value })
                                    }
                                    placeholder="Customer name"
                                    className="flex-1 min-w-0 px-3 py-2 bg-transparent border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />

                                {/* Star rating */}
                                <StarRatingInput
                                    value={testimonial.rating}
                                    onChange={(rating) => updateTestimonial(index, { rating })}
                                    size="sm"
                                />

                                {/* Featured toggle */}
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateTestimonial(index, {
                                            is_featured: !testimonial.is_featured,
                                        })
                                    }
                                    className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                                    title={testimonial.is_featured ? "Unfeature" : "Feature"}
                                >
                                    <Star
                                        className={`w-4 h-4 ${
                                            testimonial.is_featured
                                                ? "text-yellow-400 fill-yellow-400"
                                                : "text-gray-300"
                                        }`}
                                    />
                                </button>

                                {/* Delete button */}
                                <button
                                    type="button"
                                    onClick={() => removeTestimonial(index)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Quote textarea */}
                            <textarea
                                value={testimonial.quote}
                                onChange={(e) =>
                                    updateTestimonial(index, { quote: e.target.value })
                                }
                                placeholder="Customer quote..."
                                rows={3}
                                className="w-full px-4 py-3 bg-transparent border border-[var(--card-border)] rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
