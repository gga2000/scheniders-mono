import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: false, // Don't reload when coming back online
  disable: process.env.NODE_ENV === "development", // Disable in dev to fix HMR
  register: false, // We register manually in PWAProvider
});

// pnpm keeps the real package under the workspace root's .pnpm store.
const SPARTICUZ_CHROMIUM_BIN = "../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**";

// Sent on every response. frame-ancestors 'self' stops other sites from
// loading the merchant admin in a hidden frame (clickjacking); the admin's own
// label and payslip previews are same-origin and keep working.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Scanner (camera) and voice notes (microphone) run on our own pages only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // StrictMode helps catch bugs in development
  reactStrictMode: true,
  poweredByHeader: false,

  // Transpile workspace packages
  transpilePackages: ["@scheniders/sections", "@scheniders/shared", "@scheniders/supabase", "@scheniders/ui"],

  // Externalize pdf-parse and pdfjs-dist from the server bundle
  // so Node.js resolves them natively (avoids Turbopack worker issues)
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "puppeteer-core", "@sparticuz/chromium"],

  // @sparticuz/chromium reads its compressed browser from bin/ with fs at
  // runtime, so the file tracer never sees it. Ship it with the PDF routes.
  outputFileTracingIncludes: {
    "/api/generate-batch-pdf": [SPARTICUZ_CHROMIUM_BIN],
    "/api/payslip-pdf": [SPARTICUZ_CHROMIUM_BIN],
  },

  // Image hosts — Supabase Storage serves through a CDN, but we still
  // want Next's optimizer for avif/webp + responsive sizes. The
  // remotePatterns wildcard covers both the active project and any
  // legacy/archived buckets still referenced in DB rows.
  images: {
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
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 390, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },


  typescript: {
    ignoreBuildErrors: true,
  },

  // Bundle optimization - tree-shake these large packages
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-toast",
      "exceljs",
      "html2canvas",
      "jspdf",
      "jspdf-autotable",
      "@tanstack/react-virtual",
      "zustand",
      "xlsx",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@supabase/supabase-js",
      "@supabase/ssr"
    ],
  },

  // Empty turbopack config for Next.js 16 compatibility
  // This silences the warning when webpack config is present but not used
  turbopack: {},

  // Webpack config for optional bundle analysis (use with: pnpm analyze)
  // Note: This only runs when ANALYZE=true, otherwise Turbopack handles the build
  webpack: (config, { isServer }) => {
    if (process.env.ANALYZE === "true") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dev-only analyzer, loaded only when ANALYZE=true
      const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: "static",
          reportFilename: isServer
            ? "../analyze/server.html"
            : "./analyze/client.html",
          openAnalyzer: false,
        })
      );
    }
    return config;
  },

  // Reviews and cart recovery moved inside the Store section; keep old links alive.
  // The app opens on Orders: staff spend their day there, and landing on the
  // dashboard first cost every launch its metrics RPCs and widgets for nothing.
  // The dashboard lives at /dashboard. Not permanent, so the choice can change.
  async redirects() {
    return [
      { source: '/', destination: '/orders', permanent: false },
      { source: '/reviews', destination: '/store/reviews', permanent: false },
      { source: '/recovery', destination: '/store/recovery', permanent: false },
    ];
  },

  // Edge Caching Strategy
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // Cache fonts aggressively (immutable)
        source: '/fonts/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache images aggressively (immutable)
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // General static assets
        source: '/(.*).(png|jpg|jpeg|svg|webp|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  org: "ali-b1",
  project: "javascript-nextjs",
});
