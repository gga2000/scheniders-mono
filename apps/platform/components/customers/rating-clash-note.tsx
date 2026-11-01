"use client";

import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/**
 * "“VIP” is also a customer rating…": the sentence runs in the UI language's
 * direction, set on this element only (never on <html>), because a Latin tag
 * name such as "VIP" opening an Arabic sentence would otherwise make it an
 * LTR paragraph and put «VIP» at the far (wrong) end of the line. The name is
 * its own isolated run, so its letters and digits never reorder the words
 * around it. Left-set in both languages, next to its info icon, like the other
 * Arabic helper copy.
 */
export function RatingClashNote({ name, className }: { name: string; className?: string }) {
    const { t, language } = useLanguage();
    // The template keeps "{name}" when no value is passed, so the name can be placed as an element.
    const [before, after] = t("customers.tag.ratingClash").split("{name}");

    return (
        <span dir={language === "ar" ? "rtl" : "ltr"} className={cn("text-left", className)}>
            {before}
            {after !== undefined && (
                <>
                    <span className="[unicode-bidi:isolate]">{name}</span>
                    {after}
                </>
            )}
        </span>
    );
}
