import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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

export default nextConfig;
