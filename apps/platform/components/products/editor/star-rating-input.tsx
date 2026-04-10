"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingInputProps {
    value: number;
    onChange: (rating: number) => void;
    size?: "sm" | "md" | "lg";
    readonly?: boolean;
}

const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
};

export function StarRatingInput({
    value,
    onChange,
    size = "md",
    readonly = false,
}: StarRatingInputProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const starSize = sizeClasses[size];

    return (
        <div
            className="flex items-center gap-0.5"
            onMouseLeave={() => {
                if (!readonly) setHoverIndex(null);
            }}
        >
            {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = hoverIndex !== null ? star <= hoverIndex : star <= value;
                const isHovered = hoverIndex !== null && star <= hoverIndex;

                return (
                    <button
                        key={star}
                        type="button"
                        disabled={readonly}
                        onClick={() => {
                            if (!readonly) onChange(star);
                        }}
                        onMouseEnter={() => {
                            if (!readonly) setHoverIndex(star);
                        }}
                        className={`p-0 border-0 bg-transparent ${readonly ? "cursor-default" : "cursor-pointer"} transition-colors`}
                    >
                        <Star
                            className={`${starSize} ${
                                isHovered
                                    ? "text-yellow-300 fill-yellow-300"
                                    : isFilled
                                      ? "text-yellow-400 fill-yellow-400"
                                      : "text-gray-300"
                            } transition-colors`}
                        />
                    </button>
                );
            })}
        </div>
    );
}
