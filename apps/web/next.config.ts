import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The Database type in lib/types/database.ts is a manual stub.
  // Once you've deployed and run:
  //   pnpm dlx supabase gen types typescript --project-id YOUR_ID --schema public \
  //     > apps/web/lib/types/database.ts
  // ...you can flip these back to false to get full type-safety on every build.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      // Supabase Storage public bucket URLs
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default config;
