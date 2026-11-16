import { createContext, useContext, type ReactNode } from "react";
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

/** True inside a SummaryPanel: the panel draws the frame, so its cards draw none of their own. */
const InPanel = createContext(false);

/**
 * Several cards as the columns of one white panel, with thin lines between
 * them (like the columns of the dark strip), instead of a row of boxes.
 */
export function SummaryPanel({ children, testId }: { children: ReactNode; testId?: string }) {
    return (
        <div
            className="grid grid-cols-1 divide-y divide-[var(--card-border)] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] lg:grid-cols-3 lg:divide-x lg:divide-y-0"
            data-testid={testId}
        >
            <InPanel.Provider value>{children}</InPanel.Provider>
        </div>
    );
}

/** A white card of the summary page: a plain title, one quiet line under it, then the content. */
export function SummaryCard({ title, sub, textDir, action, children, footer, className, testId }: SummaryCardProps) {
    const inPanel = useContext(InPanel);
    return (
        <section
            className={cn("flex flex-col p-5 lg:p-6", !inPanel && "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]", className)}
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
