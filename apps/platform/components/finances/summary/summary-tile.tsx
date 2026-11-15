import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SummaryTileProps {
    icon: LucideIcon;
    /** The tile's colour: the icon, on a light wash of the same colour. */
    color: string;
    title: string;
    textDir: "rtl" | "ltr";
    children: ReactNode;
    /** Where to go next: a link, kept at the bottom of the tile. */
    footer: ReactNode;
    testId: string;
}

/** A small card that answers one question in a sentence: an icon, the question, then the answer stacked under it. */
export function SummaryTile({ icon: Icon, color, title, textDir, children, footer, testId }: SummaryTileProps) {
    return (
        <section className="flex h-full flex-col gap-2.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 lg:p-6" data-testid={testId}>
            <span
                className="flex size-12 items-center justify-center rounded-[15px]"
                style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
            >
                <Icon className="size-[22px]" aria-hidden="true" />
            </span>
            <h2 className="mt-1.5 text-left text-[15px] font-semibold text-muted" dir={textDir}>{title}</h2>
            {children}
            <div className="mt-auto pt-2">{footer}</div>
        </section>
    );
}
