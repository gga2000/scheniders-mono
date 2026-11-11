import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// The internal admin app is never embedded anywhere.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
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
  transpilePackages: ["@scheniders/shared", "@scheniders/supabase", "@scheniders/ui"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "zustand",
      "sonner",
      "@supabase/supabase-js",
      "@supabase/ssr",
    ],
  },
  turbopack: {},
};

// org, project and the upload key come from SENTRY_ORG, SENTRY_PROJECT and
// SENTRY_AUTH_TOKEN, which the Sentry Vercel integration sets per project.
// With them, every production build creates a release named after the git
// commit and uploads source maps (then deletes them from the deploy).
export default withSentryConfig(nextConfig, {
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
