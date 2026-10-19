import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/url";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/book/confirmed/"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
