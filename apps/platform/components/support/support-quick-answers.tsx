"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Lightbulb } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import type { QuickAnswer } from "@/lib/support/quick-answers";
import { cn } from "@/lib/utils";

/**
 * A short list of questions with their answers folded under them. Opening the
 * page an answer points to closes the chat, so the merchant lands on it.
 */
export function SupportQuickAnswers({
    title,
    answers,
    onOpenPage,
    className,
}: {
    title: string;
    answers: readonly QuickAnswer[];
    onOpenPage: () => void;
    className?: string;
}) {
    const { t, language } = useLanguage();
    const [openId, setOpenId] = useState<string | null>(null);
    if (answers.length === 0) return null;

    return (
        <div className={cn("rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]", className)}>
            <p className="flex items-center gap-1.5 px-3.5 pt-3 text-xs font-semibold text-muted">
                <Lightbulb className="h-3.5 w-3.5" />
                <span dir="auto">{title}</span>
            </p>
            <ul className="divide-y divide-[var(--card-border)] px-1.5 pb-1.5 pt-1">
                {answers.map((qa) => {
                    const open = openId === qa.id;
                    return (
                        <li key={qa.id}>
                            <button
                                type="button"
                                aria-expanded={open}
                                onClick={() => setOpenId(open ? null : qa.id)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                            >
                                <span dir="auto" className="min-w-0 flex-1">{qa.question[language]}</span>
                                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
                            </button>
                            {open && (
                                <div className="px-2 pb-2.5">
                                    <p dir="auto" className="text-sm leading-relaxed text-muted">{qa.answer[language]}</p>
                                    <Link
                                        href={qa.href}
                                        onClick={onOpenPage}
                                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background transition-opacity hover:opacity-90 dark:bg-primary dark:text-(--primary-fg)"
                                    >
                                        {t("support.quick.open")}
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
