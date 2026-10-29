"use client";

// =====================================================================
// <ContactLine> — "who contacts you, and when", under an order button
// =====================================================================
// Renders `resolveContactLine` (packages/shared/src/contact-line.ts) for
// the store's `commerce.contact`. Server and hydrating client both start
// from the request moment (`ctx.runtime.now`), so the first paint matches;
// after mount the browser clock takes over, and a timed line re-reads it
// every minute so a page left open across closing time stops saying
// "today". A channel-only line never ticks. Styling is the caller's: the
// classic and express layouts each match their own reassurance line.
// =====================================================================

import { useEffect, useState } from "react";
import { resolveContactLine } from "@scheniders/shared";
import type { LocaleCode, ResolvedContactLine, StoreContactConfig } from "@scheniders/shared";
import { MaterialIcon } from "./primitives";

/** How often a timed line re-reads the clock. */
export const CONTACT_LINE_TICK_MS = 60_000;

/** The resolved line for `contact`, from the request moment on the server
 *  and the first paint, then from the browser clock; a timed line re-reads
 *  it every minute. Null = render nothing. Shared by <ContactLine> and the
 *  express promise band, so both say the same sentence at the same time. */
export function useContactLine(
  contact: StoreContactConfig | undefined,
  locale: LocaleCode,
  initialNow: Date,
): ResolvedContactLine | null {
  const [now, setNow] = useState(() => new Date(initialNow));
  const line = resolveContactLine(contact, locale, now);
  const timed = line !== null && line.variant !== "channel";

  useEffect(() => {
    if (!timed) return;
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, CONTACT_LINE_TICK_MS);
    return () => clearInterval(id);
  }, [timed]);

  return line;
}

/** The sentence with its number isolated in a <bdi>, so the digits keep
 *  their order inside Arabic text on this LTR page. */
export function ContactLineText({ line }: { line: ResolvedContactLine }) {
  const at = line.text.indexOf(line.number);
  if (at === -1) return <>{line.text}</>;
  return (
    <>
      {line.text.slice(0, at)}
      <bdi className="whitespace-nowrap">{line.number}</bdi>
      {line.text.slice(at + line.number.length)}
    </>
  );
}

export function ContactLine({
  contact,
  locale,
  initialNow,
  className,
  iconClassName,
}: {
  /** The stored `commerce.contact`; validated by the resolver. */
  contact: StoreContactConfig | undefined;
  locale: LocaleCode;
  /** The request moment (`ctx.runtime.now`). */
  initialNow: Date;
  className: string;
  iconClassName: string;
}) {
  const line = useContactLine(contact, locale, initialNow);
  if (!line) return null;
  return (
    <p className={className} data-contact-line={line.variant}>
      <MaterialIcon name="call" className={iconClassName} />
      <span>
        <ContactLineText line={line} />
      </span>
    </p>
  );
}
