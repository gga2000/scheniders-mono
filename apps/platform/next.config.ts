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

  // Webpack config for optional bundle analysis
  webpack: (config, { isServer }) => {
    if (process.env.ANALYZE === "true") {
      // Dynamic import to avoid requiring the dependency in production
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
