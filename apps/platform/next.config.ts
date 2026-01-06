import type { NextConfig } from "next";

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
};

export default nextConfig;
