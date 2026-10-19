import type { ReactNode } from "react";
import type { Tenant, Category } from "@/lib/types";
import { SchneidersPageShell } from "./page-shell";
import { PageHeader } from "./content-page";
import { BentoCard, ChunkyLink, MaterialIcon, ScribbleHeading, Sticker, WhatsAppIcon } from "./primitives";

type ScribbleColor = "butter" | "mint" | "lilac" | "sky" | "pink";

export interface PolicySection {
  bg: "white" | "mint" | "butter" | "lilac" | "sky" | "pink" | "cream";
  heading: string;
  body: ReactNode;
}

interface Props {
  tenant: Tenant;
  categories: Category[];
  whatsappNumber?: string | null;
  promo?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  color?: ScribbleColor;
  tldr?: { bg: "mint" | "butter" | "lilac" | "sky" | "pink"; bullets: string[] };
  lastUpdated?: string;
  sections: PolicySection[];
  /** Optional bottom CTA card; defaults to a "Have a question?" WhatsApp card. */
  footerCard?: ReactNode;
}

export function SchneidersPolicyPage({
  tenant,
  categories,
  whatsappNumber,
  promo,
  eyebrow,
  title,
  subtitle,
  color = "butter",
  tldr,
  lastUpdated,
  sections,
  footerCard,
}: Props) {
  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo={promo}>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} color={color} />
      {lastUpdated && (
        <p className="-mt-2">
          <Sticker bg="cream" rotate={-2} size="xs">
            Last updated: {lastUpdated}
          </Sticker>
        </p>
      )}

      {tldr && (
        <BentoCard bg={tldr.bg} rotate={1} className="p-5">
          <Sticker bg="cream" rotate={-6} size="xs" className="mb-2">
            TL;DR
          </Sticker>
          <ul className="font-body text-sm space-y-2 mt-2">
            {tldr.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </BentoCard>
      )}

      <div className="space-y-3">
        {sections.map((s, i) => (
          <BentoCard
            key={s.heading}
            bg={s.bg}
            rotate={i % 2 === 0 ? 0.4 : -0.4}
            className="p-5"
          >
            <ScribbleHeading color={color} as="h3">{s.heading}</ScribbleHeading>
            <div className="font-body text-sm leading-relaxed mt-3 space-y-2">{s.body}</div>
          </BentoCard>
        ))}
      </div>

      {footerCard ?? (
        <BentoCard bg="pink" className="p-5 text-center text-white">
          <h3 className="font-display font-black text-xl uppercase mb-2">Have a question?</h3>
          {whatsappNumber ? (
            <a
              href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="bento-card bg-white text-bk-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all rounded-xl uppercase tracking-tight"
            >
              <WhatsAppIcon className="w-5 h-5 text-bk-success" />
              Chat with us
            </a>
          ) : (
            <ChunkyLink href="/contact" bg="white" size="md">
              <MaterialIcon name="mail" className="text-lg" /> Contact us
            </ChunkyLink>
          )}
        </BentoCard>
      )}
    </SchneidersPageShell>
  );
}
