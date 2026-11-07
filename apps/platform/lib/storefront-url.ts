// =====================================================================
// Where a tenant's storefront lives
// =====================================================================
// Pure so it can be tested: the hook around it only supplies the verified
// custom domain. Getting this wrong is quiet and expensive — the editor
// preview points at the wrong origin and the merchant sees a storefront
// that is not the one they are editing.
// =====================================================================

/** The conventional local storefront port, used only when nothing else says. */
export const DEFAULT_DEV_STOREFRONT_PORT = 3001;

export interface StorefrontUrlInput {
  slug: string;
  /** A verified custom domain, when the tenant has one. */
  customDomain?: string | null;
  /** NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN — may carry a port in development. */
  rootDomain?: string | null;
  /** The hostname the platform itself is being served from. */
  hostname?: string | null;
}

function isLocal(host: string | null | undefined): boolean {
  return Boolean(host && (host === "localhost" || host.startsWith("localhost:")));
}

export function buildStorefrontUrl({
  slug,
  customDomain,
  rootDomain,
  hostname,
}: StorefrontUrlInput): string {
  // On localhost the production root domain is unreachable, so the preview
  // has to point at a local storefront. Honour a configured local origin
  // first — the dev port is not always 3001, and hardcoding it sends the
  // merchant to whatever happens to be listening there, which may be a
  // different checkout of the same app.
  if (isLocal(hostname)) {
    const origin = isLocal(rootDomain)
      ? rootDomain
      : `localhost:${DEFAULT_DEV_STOREFRONT_PORT}`;
    return `http://${origin}/s/${slug}`;
  }

  if (customDomain) return `https://${customDomain}`;

  if (rootDomain && !isLocal(rootDomain)) {
    return `https://${slug}.${rootDomain}`;
  }

  // Root domain is a local value while the platform is served from a real
  // host: no subdomain to build, so fall back to the path form.
  return `http://${rootDomain}/s/${slug}`;
}

export interface VerifiedDomain {
  domain: string;
  created_at: string | null;
}

/** A Vercel-issued host is plumbing, not the address shoppers know. */
function isPlatformHost(domain: string): boolean {
  return domain.endsWith(".vercel.app");
}

/**
 * The one domain links and the editor preview should use when a store has
 * several verified domains (e.g. scheniders.com, www.scheniders.com and the
 * old *.vercel.app host). Without an order the database hands back any of
 * them, so "Visit store" sometimes opened the vercel.app address. Order:
 * a real domain before a Vercel host, the www form before the bare one, then
 * the oldest — so the pick is stable across loads.
 */
export function pickPrimaryDomain(domains: readonly VerifiedDomain[]): string | null {
  if (domains.length === 0) return null;
  const rank = (d: VerifiedDomain): number =>
    (isPlatformHost(d.domain) ? 2 : 0) + (d.domain.startsWith("www.") ? 0 : 1);
  const sorted = [...domains].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
  return sorted[0].domain;
}
