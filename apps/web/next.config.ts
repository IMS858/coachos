import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      // Supabase Storage public bucket URLs
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default config;
