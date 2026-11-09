// =====================================================================
// TemplateSketch — a small wireframe of a page template
// =====================================================================
// Drawn from the template's real section list, top to bottom, so two
// templates never look alike and the card shows what the page will hold:
// a big cover, a row of product tiles, a countdown, questions, quotes.
// Pure markup, no images: it stays sharp at any size and in dark mode.
// =====================================================================

import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

const ink = "bg-foreground/20";
const accent = "bg-primary/45";

function Lines({ n, className }: { n: number; className?: string }): ReactElement {
    const widths = ["w-3/4", "w-full", "w-2/3", "w-5/6"];
    return (
        <span className={cn("flex min-w-0 flex-1 flex-col justify-center gap-[3px]", className)}>
            {Array.from({ length: n }, (_, i) => (
                <span key={i} className={cn("h-[3px] rounded-full", ink, widths[i % widths.length])} />
            ))}
        </span>
    );
}

function Tiles({ n }: { n: number }): ReactElement {
    return (
        <span className="flex h-full gap-1">
            {Array.from({ length: n }, (_, i) => (
                <span key={i} className={cn("h-full flex-1 rounded-[3px]", ink)} />
            ))}
        </span>
    );
}

/** How tall each kind of section draws, relative to the others. */
const WEIGHT: Record<string, number> = {
    hero_image: 3,
    product_grid: 2.4,
    image_gallery: 2,
    brand_story: 1.8,
    about_block: 1.8,
    founder_note: 1.6,
    faq_accordion: 1.6,
    testimonials_carousel: 1.4,
    press_quotes: 1.2,
    countdown_card: 1.2,
    trust_strip: 1,
    delivery_promise: 1,
    newsletter_inline: 1,
    promo_banner: 0.8,
    marquee_strip: 0.6,
};

function Block({ type }: { type: string }): ReactElement {
    switch (type) {
        case "hero_image":
            return (
                <span className="flex h-full items-center rounded-[4px] bg-primary/15 px-2">
                    <span className="flex w-1/2 flex-col gap-[3px]">
                        <span className={cn("h-1 w-full rounded-full", ink)} />
                        <span className={cn("h-[3px] w-2/3 rounded-full", ink)} />
                        <span className={cn("mt-0.5 h-1.5 w-1/3 rounded-full", accent)} />
                    </span>
                </span>
            );
        case "promo_banner":
            return (
                <span className={cn("flex h-full items-center justify-center rounded-[3px]", accent)}>
                    <span className="h-[3px] w-1/3 rounded-full bg-white/80" />
                </span>
            );
        case "marquee_strip":
            return (
                <span className="flex h-full items-center gap-1.5 overflow-hidden rounded-[2px] bg-foreground/10 px-1">
                    {Array.from({ length: 8 }, (_, i) => (
                        <span key={i} className={cn("h-[2px] w-3 shrink-0 rounded-full", ink)} />
                    ))}
                </span>
            );
        case "trust_strip":
        case "delivery_promise":
            return (
                <span className="flex h-full items-center justify-around">
                    {Array.from({ length: 3 }, (_, i) => (
                        <span key={i} className="flex items-center gap-1">
                            <span className={cn("h-2 w-2 rounded-full", type === "delivery_promise" ? accent : ink)} />
                            <span className={cn("h-[3px] w-5 rounded-full", ink)} />
                        </span>
                    ))}
                </span>
            );
        case "product_grid":
            return <Tiles n={4} />;
        case "image_gallery":
            return <Tiles n={3} />;
        case "countdown_card":
            return (
                <span className="flex h-full items-center justify-center gap-1">
                    {Array.from({ length: 4 }, (_, i) => (
                        <span key={i} className={cn("h-full max-h-4 w-3.5 rounded-[2px]", accent)} />
                    ))}
                </span>
            );
        case "faq_accordion":
            return (
                <span className="flex h-full flex-col justify-center gap-[3px]">
                    {Array.from({ length: 3 }, (_, i) => (
                        <span key={i} className="h-1.5 w-full rounded-[2px] border border-foreground/20" />
                    ))}
                </span>
            );
        case "newsletter_inline":
            return (
                <span className="flex h-full items-center gap-1 px-3">
                    <span className="h-2 flex-1 rounded-full border border-foreground/25" />
                    <span className={cn("h-2 w-6 rounded-full", accent)} />
                </span>
            );
        case "brand_story":
        case "about_block":
        case "founder_note":
            return (
                <span className="flex h-full items-center gap-2">
                    <span className={cn("aspect-square h-full", type === "founder_note" ? "rounded-full" : "rounded-[3px]", ink)} />
                    <Lines n={3} />
                </span>
            );
        case "testimonials_carousel":
        case "press_quotes":
            return (
                <span className="flex h-full gap-1">
                    {Array.from({ length: type === "press_quotes" ? 3 : 2 }, (_, i) => (
                        <span key={i} className="flex flex-1 items-center rounded-[3px] border border-foreground/15 px-1">
                            <Lines n={2} />
                        </span>
                    ))}
                </span>
            );
        default:
            return <Lines n={2} />;
    }
}

export function TemplateSketch({ types }: { types: readonly string[] }): ReactElement {
    return (
        <div
            aria-hidden="true"
            data-testid="template-sketch"
            className="flex aspect-[16/9] w-full flex-col gap-1 rounded-lg border border-(--card-border) bg-background p-1.5"
        >
            {types.map((type, i) => (
                <span
                    key={`${type}-${i}`}
                    data-sketch={type}
                    className="block min-h-0"
                    style={{ flexGrow: WEIGHT[type] ?? 1, flexBasis: 0 }}
                >
                    <Block type={type} />
                </span>
            ))}
        </div>
    );
}
