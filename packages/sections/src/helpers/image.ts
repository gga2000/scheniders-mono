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

/**
 * Host + path pairs mirroring each remotePatterns entry. A pattern with a
 * `pathname` in next.config.ts must carry the same `path` here: Next
 * refuses a URL on an allowed host whose path falls outside it.
 */
const OPTIMIZABLE_HOST_PATTERNS: { host: RegExp; path?: RegExp }[] = [
  { host: /\.supabase\.co$/i, path: /^\/storage\/v1\/object\/public\// },
  { host: /^images\.unsplash\.com$/i },
  // YouTube thumbnails (video_block's click-to-play facade).
  { host: /^i\.ytimg\.com$/i, path: /^\/vi\// },
];

/**
 * True when `url` is on a host next/image is configured to optimize (or a
 * same-origin relative path). Use as `unoptimized={!isOptimizableImageHost(url)}`.
 */
export function isOptimizableImageHost(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true; // same-origin relative
  try {
    const { hostname, pathname } = new URL(url);
    return OPTIMIZABLE_HOST_PATTERNS.some(
      (p) => p.host.test(hostname) && (!p.path || p.path.test(pathname)),
    );
  } catch {
    return false;
  }
}
