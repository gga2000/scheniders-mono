import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@scheniders/shared", "@scheniders/supabase", "@scheniders/ui"],
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
      "@radix-ui/react-switch",
      "zustand",
      "sonner",
      "@supabase/supabase-js",
      "@supabase/ssr",
    ],
  },
  turbopack: {},
};

export default nextConfig;
