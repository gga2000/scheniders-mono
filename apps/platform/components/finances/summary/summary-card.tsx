import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
    title: string;
    sub?: string;
    /** Direction of the title and subtitle text (Arabic sentences lay out right to left inside the LTR page). */
    textDir: "rtl" | "ltr";
    action?: ReactNode;
    children: ReactNode;
    /** Where to go next: links kept at the bottom of the card, so cards in one row end on one line. */
    footer?: ReactNode;
    className?: string;
    testId?: string;
}

/** The one big figure a small card leads with, before its sentence. */
export const CARD_FIGURE = "text-[30px] font-bold leading-none tracking-[-0.02em] text-foreground";

/** A link at the foot of a card. */
export const CARD_LINK =
    "inline-flex items-center gap-1 text-[13px] font-semibold text-foreground underline decoration-[var(--card-border)] underline-offset-4 hover:decoration-current";

/** A white card of the summary page: a plain title, one quiet line under it, then the content. */
export function SummaryCard({ title, sub, textDir, action, children, footer, className, testId }: SummaryCardProps) {
    return (
        <section
            className={cn("flex flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 lg:p-6", className)}
            data-testid={testId}
        >
            <header className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-left text-[17px] font-semibold tracking-[-0.01em] text-foreground" dir={textDir}>{title}</h2>
                    {sub && <p className="mt-1 text-left text-[13px] leading-relaxed text-muted" dir={textDir}>{sub}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </header>
            {children}
            {footer && <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-4">{footer}</div>}
        </section>
    );
}
