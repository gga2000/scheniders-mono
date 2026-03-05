import React from "react";
import { cn } from "@/lib/utils";

interface HighlightedTextProps {
    text: string | null | undefined;
    query: string;
    className?: string;
    highlightClassName?: string;
}

export function HighlightedText({
    text,
    query,
    className,
    highlightClassName,
}: HighlightedTextProps) {
    if (!text) return null;
    if (!query || query.trim() === "") {
        return <span className={className}>{text}</span>;
    }

    // Escape regex characters from the query
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Create a case-insensitive regular expression
    const regex = new RegExp(`(${escapedQuery})`, "gi");

    // Split the text based on the regex
    const parts = text.split(regex);

    return (
        <span className={className}>
            {parts.map((part, index) => {
                // If the part matches the query case-insensitively, highlight it
                if (part.toLowerCase() === query.toLowerCase()) {
                    return (
                        <mark
                            key={index}
                            className={cn(
                                "bg-yellow-200 text-yellow-900",
                                "dark:bg-yellow-500/30 dark:text-yellow-200",
                                highlightClassName
                            )}
                        >
                            {part}
                        </mark>
                    );
                }
                // Otherwise, render normal text
                return <React.Fragment key={index}>{part}</React.Fragment>;
            })}
        </span>
    );
}
