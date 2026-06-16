import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IMS Coach OS",
    template: "%s · IMS Coach OS",
  },
  description:
    "Innovative Movement Solutions — premium movement coaching studio in Scripps Ranch.",
  robots: { index: false, follow: false },
};

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
