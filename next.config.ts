import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: false, // Don't reload when coming back online
  disable: process.env.NODE_ENV === "development", // Disable in dev to fix HMR
  register: false, // We register manually in PWAProvider
});

const nextConfig: NextConfig = {
  // StrictMode helps catch bugs in development
  reactStrictMode: true,

  // Bundle optimization - tree-shake these large packages
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-popover",
      "@radix-ui/react-slot",
      "@radix-ui/react-toast",
      "@radix-ui/react-switch",
      "exceljs",
      "html2canvas",
      "jspdf",
      "jspdf-autotable",
      "@tanstack/react-virtual",
      "zustand",
      "xlsx",
      "sonner",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@supabase/supabase-js",
      "@supabase/ssr"
    ],
  },

  // Empty turbopack config for Next.js 16 compatibility
  // This silences the warning when webpack config is present but not used
  turbopack: {},

  // Webpack config for optional bundle analysis (use with: npm run analyze)
  // Note: This only runs when ANALYZE=true, otherwise Turbopack handles the build
  webpack: (config, { isServer }) => {
    if (process.env.ANALYZE === "true") {
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

  // Edge Caching Strategy
  async headers() {
    return [
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
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
  org: "ali-b1",
  project: "javascript-nextjs",
});
