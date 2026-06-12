import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IMS Coach OS",
    short_name: "Coach OS",
    description:
      "Innovative Movement Solutions — coaching operations platform.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b1e31",
    theme_color: "#0b1e31",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
