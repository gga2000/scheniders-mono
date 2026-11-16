"use client";

import { useLanguage } from "@/hooks/use-language";

/**
 * A count and its noun, as one reading-order isolate: «5 طلبات», «12 طلباً».
 * Arabic does not put a numeral before one or two of a thing, so 1 and 2 read
 * «طلب واحد» and «طلبان» (from `<word>One` / `<word>Two`), not «1 طلب».
 * `word` is a dictionary key with plural forms (`.few`, `.many`, `.one`).
 */
export function CountWithWord({
    count,
    word,
    className,
    numberClassName,
    wordClassName,
}: {
    count: number;
    word: string;
    className?: string;
    numberClassName?: string;
    wordClassName?: string;
}) {
    const { t, language } = useLanguage();
    if (language === "ar" && (count === 1 || count === 2)) {
        return (
            <bdi className={className}>
                <span className={wordClassName}>{t(`${word}${count === 1 ? "One" : "Two"}`)}</span>
            </bdi>
        );
    }
    return (
        <bdi className={className}>
            <span className={numberClassName}>{count.toLocaleString("en-US")}</span>{" "}
            <span className={wordClassName}>{t(word, { count })}</span>
        </bdi>
    );
}
