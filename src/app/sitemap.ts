import type { MetadataRoute } from "next";
import { isDemo } from "@/lib/demo/flag";
import { siteUrl } from "@/lib/url";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  if (isDemo) return [];
  return ["/", "/book/", "/privacy/"].map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
