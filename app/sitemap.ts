import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "./lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-05T00:00:00.000Z");

  return PUBLIC_PAGES.map((page) => {
    let priority = 0.8;
    let changeFrequency: "daily" | "weekly" | "monthly" = "weekly";

    if (page.path === "/") {
      priority = 1.0;
      changeFrequency = "daily";
    } else if (page.path.startsWith("/ai-") || page.path === "/pricing" || page.path === "/caption-generator") {
      priority = 0.9;
      changeFrequency = "weekly";
    } else if (page.path === "/how-to-use" || page.path === "/faq") {
      priority = 0.85;
      changeFrequency = "weekly";
    } else {
      priority = 0.7;
      changeFrequency = "monthly";
    }

    return {
      url: new URL(page.path, SITE_URL).href,
      lastModified,
      changeFrequency,
      priority,
    };
  });
}
