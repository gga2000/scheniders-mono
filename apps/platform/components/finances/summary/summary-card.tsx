import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
    title: string;
    sub?: string;
    /** Direction of the title and subtitle text (Arabic sentences lay out right to left inside the LTR page). */
    textDir: "rtl" | "ltr";
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    testId?: string;
}

/** A white card of the summary page: a plain title, one quiet line under it, then the content. */
export function SummaryCard({ title, sub, textDir, action, children, className, testId }: SummaryCardProps) {
    return (
        <section
            className={cn("rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 lg:p-6", className)}
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
        </section>
    );
}
