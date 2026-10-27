/** Where to land: `to` resolved against our own origin, kept only when it
 *  STAYS on that origin. Judged on the parsed URL, not the raw string —
 *  the URL parser strips tabs/newlines and folds "\\" to "/", so a raw
 *  "/\t/evil.example" check passes while it resolves to //evil.example. */
export function sameOriginTarget(to: string | undefined, origin: string): URL {
  const home = new URL("/", origin);
  if (!to) return home;
  let target: URL;
  try {
    target = new URL(to, origin);
  } catch {
    // An unparseable `to` is a bad request param, not a failure to hide:
    // land on the store home.
    return home;
  }
  return target.origin === home.origin ? target : home;
}
