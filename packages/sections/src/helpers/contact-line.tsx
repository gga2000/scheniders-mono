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
import type { LocaleCode, StoreContactConfig } from "@scheniders/shared";
import { MaterialIcon } from "./primitives";

/** How often a timed line re-reads the clock. */
export const CONTACT_LINE_TICK_MS = 60_000;

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

  if (!line) return null;
  const at = line.text.indexOf(line.number);
  return (
    <p className={className} data-contact-line={line.variant}>
      <MaterialIcon name="call" className={iconClassName} />
      <span>
        {at === -1 ? (
          line.text
        ) : (
          <>
            {line.text.slice(0, at)}
            <bdi className="whitespace-nowrap">{line.number}</bdi>
            {line.text.slice(at + line.number.length)}
          </>
        )}
      </span>
    </p>
  );
}
