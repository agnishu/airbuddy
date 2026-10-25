import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Airbuddy",
    short_name: "Airbuddy",
    description: "Share a cab to or from the airport with someone nearby.",
    start_url: "/trips",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0369a1",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
