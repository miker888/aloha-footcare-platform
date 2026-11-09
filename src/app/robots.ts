import type { MetadataRoute } from "next";
import { isDemo } from "@/lib/demo/flag";
import { siteUrl } from "@/lib/url";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  if (isDemo) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/book/confirmed/"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
