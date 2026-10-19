"use client";

import type { ReactNode } from "react";
import { BentoCard, ScribbleHeading, SectionEyebrow, Sticker } from "./primitives";
import { cn } from "@/lib/utils";

type ScribbleColor = "butter" | "mint" | "lilac" | "sky" | "pink";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  color?: ScribbleColor;
  badge?: string;
}

/** Standard page header used across About / FAQ / Policy pages. */
export function PageHeader({ eyebrow, title, subtitle, color = "butter", badge }: PageHeaderProps) {
  return (
    <header className="space-y-2">
      {eyebrow && <SectionEyebrow>{eyebrow}</SectionEyebrow>}
      <ScribbleHeading color={color} as="h1">
        {title}
      </ScribbleHeading>
      {subtitle && <p className="font-body text-base text-bk-ink/80 leading-relaxed pt-1">{subtitle}</p>}
      {badge && (
        <p className="pt-2">
          <Sticker bg="cream" rotate={-2} size="xs">
            {badge}
          </Sticker>
        </p>
      )}
    </header>
  );
}

/** Body section card with a colored eyebrow + heading + content. */
export function ContentSection({
  eyebrow,
  heading,
  children,
  bg = "white",
  rotate = 0,
  className,
}: {
  eyebrow?: string;
  heading?: string;
  children: ReactNode;
  bg?: "white" | "mint" | "butter" | "lilac" | "sky" | "pink" | "cream";
  rotate?: number;
  className?: string;
}) {
  return (
    <BentoCard bg={bg} rotate={rotate} className={cn("p-5 space-y-2", className)}>
      {eyebrow && <SectionEyebrow>{eyebrow}</SectionEyebrow>}
      {heading && (
        <h3 className="font-display font-black text-xl uppercase leading-tight">{heading}</h3>
      )}
      <div className="font-body text-sm leading-relaxed space-y-2">{children}</div>
    </BentoCard>
  );
}
