import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withBotId } from "botid/next/config";
import { SAFE_PARENT_ORIGINS } from "./lib/preview-origin";

// Only the store itself and the merchant admin's store-builder preview may
// frame a store page; any other site framing it is a clickjacking attempt.
const FRAME_ANCESTORS = [
  "'self'",
  ...SAFE_PARENT_ORIGINS,
  ...(process.env.NEXT_PUBLIC_PLATFORM_ORIGIN ? [process.env.NEXT_PUBLIC_PLATFORM_ORIGIN] : []),
].join(" ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS}` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  transpilePackages: ["@scheniders/sections", "@scheniders/shared", "@scheniders/supabase"],
  images: {
    // Next image optimization is on so storefronts get avif/webp +
    // responsive srcsets. Supabase Storage serves the originals through
    // a CDN; Next's optimizer then transcodes per request.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // YouTube video thumbnails, for the click-to-play facade in
        // `video_block`. Only the thumbnail path — the player itself is
        // loaded by the browser from YouTube on click, not through here.
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 390, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

// org, project and the upload key come from SENTRY_ORG, SENTRY_PROJECT and
// SENTRY_AUTH_TOKEN, which the Sentry Vercel integration sets per project.
// With them, every production build creates a release named after the git
// commit and uploads source maps (then deletes them from the deploy).
export default withSentryConfig(withBotId(nextConfig), {
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // A Sentry outage or an expired upload key must not block a deploy: the
  // build still ships, and the warning is in the Vercel build log.
  errorHandler: (err) => {
    console.warn(`[sentry] release or source map upload failed: ${err.message}`);
  },
});
