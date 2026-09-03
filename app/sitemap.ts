import type { MetadataRoute } from "next";

const siteUrl = "https://koryagindesign.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date("2026-09-03"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/portfolio`,
      lastModified: new Date("2026-09-03"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
