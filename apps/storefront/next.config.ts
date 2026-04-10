import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@scheniders/shared", "@scheniders/supabase"],
  images: {
    // Supabase Storage already serves images from a CDN, so Next.js
    // optimization is redundant. Also avoids a Next 16 SSRF false-positive
    // where NAT64-mapped IPv6 addresses get flagged as "private".
    unoptimized: true,
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
