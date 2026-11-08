import { htmlToSafeParagraphs } from "@/lib/safe-paragraphs";

/** Merchant "about" text, shown as escaped paragraphs (never as raw HTML). */
export function AboutBody({ body, className }: { body: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      {htmlToSafeParagraphs(body).map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
    </div>
  );
}
