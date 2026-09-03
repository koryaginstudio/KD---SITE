import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "КОРЯГИН ДИЗАЙН™",
    short_name: "KD™",
    description: "Брендинг, визуальная айдентика, логотипы и дизайн упаковки.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f0ed",
    theme_color: "#f2f0ed",
    icons: [
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
