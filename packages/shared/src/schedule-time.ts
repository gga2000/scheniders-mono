// =====================================================================
// Zoned schedule time (EC21)
// =====================================================================
// A merchant schedules a change with a wall-clock time ("2026-06-20 14:00")
// AND an explicit timezone (Asia/Baghdad). The editor used to convert that with
// `new Date(value).toISOString()`, which interprets the wall time in the
// BROWSER's timezone — so a merchant on a non-Baghdad browser scheduled the
// change ±3h off (or on the wrong day). These helpers convert between a
// wall-clock string and a UTC instant using the SELECTED timezone (via Intl,
// so any IANA zone / DST is honoured), independent of the browser.
//
// The stored `start_iso`/`end_iso` are always UTC instants (…Z), so the
// storefront resolver can keep comparing them to `now` with `Date.parse`.
// =====================================================================

/** Offset (minutes east of UTC) of `timeZone` at the given instant. */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  // The same instant expressed as wall-clock in `timeZone`, read back as if UTC.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Convert a wall-clock datetime (`"YYYY-MM-DDTHH:mm"`, no offset) meant to be in
 * `timeZone` to a UTC instant ISO string. Returns "" for a malformed input.
 */
export function zonedWallTimeToUtcISO(wall: string, timeZone: string): string {
  const m = WALL_RE.exec(wall);
  if (!m) return "";
  const [, y, mo, d, h, mi] = m;
  // The instant if the wall time were already UTC…
  const asUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
  );
  if (Number.isNaN(asUtc)) return "";
  // …then shift by the zone's offset at that wall time. (One pass; exact for
  // fixed-offset zones like Asia/Baghdad, off only within a DST-transition hour.)
  const offset = tzOffsetMinutes(new Date(asUtc), timeZone);
  return new Date(asUtc - offset * 60_000).toISOString();
}

/**
 * Convert a UTC instant ISO string to the wall-clock `"YYYY-MM-DDTHH:mm"` a
 * `<input type="datetime-local">` expects, rendered in `timeZone`. Returns ""
 * for a malformed input.
 */
export function utcISOToZonedWallTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) parts[p.type] = p.value;
  // Intl can emit "24" for midnight under hour12:false — normalise to "00".
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
