import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mission Control",
    short_name: "Mission",
    description: "Your $50K challenge, day by day.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f7",
    theme_color: "#f3f4f7",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
