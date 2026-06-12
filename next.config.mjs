/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Force HTTPS for 2 years, include subdomains
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Never allow the portal to be iframed (clickjacking defense)
  { key: "X-Frame-Options", value: "DENY" },
  // Block MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak portal URLs to external sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The portal needs none of these browser APIs
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Private business tool — keep it out of search engines entirely
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  // Conservative CSP: self + Supabase + Vercel. Tighten further after Bunny video lands.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // TODO(hardening): 30 type errors remain (mostly implicit-any in
    // components/intake/intake-form.tsx). Fix them, then delete this block.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
