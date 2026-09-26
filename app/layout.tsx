import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IMS Coach OS",
    template: "%s · IMS Coach OS",
  },
  description:
    "Innovative Movement Solutions — premium movement coaching studio in Scripps Ranch.",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IMS",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: [
    { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { rel: "apple-touch-icon", url: "/icon-180.png", sizes: "180x180" },
  ],
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
