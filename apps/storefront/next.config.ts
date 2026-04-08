import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@scheniders/shared", "@scheniders/supabase"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sduvpgqwhxragxtxztur.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
