import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrueAlert — no more fake alert",
    short_name: "TrueAlert",
    description: "Get paid safely on Electroneum, in person or in the DMs.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f5",
    theme_color: "#10893f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
