// =====================================================================
// Image host allowlist — decides when next/image may optimize a URL.
//
// next/image throws on a host that isn't in the storefront's
// `next.config.ts` `images.remotePatterns`. Merchant-supplied image URLs
// (hero, brand story, logos) can point at arbitrary hosts, so those must
// pass `unoptimized`. For hosts we DO allow, dropping `unoptimized` lets
// Next serve AVIF/WebP + a responsive srcset (big LCP win on the hero).
//
// Keep this list in sync with apps/storefront/next.config.ts remotePatterns.
// =====================================================================

const OPTIMIZABLE_HOST_PATTERNS: RegExp[] = [
  /\.supabase\.co$/i,
  /^images\.unsplash\.com$/i,
];

/**
 * True when `url` is on a host next/image is configured to optimize (or a
 * same-origin relative path). Use as `unoptimized={!isOptimizableImageHost(url)}`.
 */
export function isOptimizableImageHost(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true; // same-origin relative
  try {
    const host = new URL(url).hostname;
    return OPTIMIZABLE_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return false;
  }
}
