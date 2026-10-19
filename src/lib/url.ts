// Public URL of the deployed site. The GitHub Pages workflow sets
// NEXT_PUBLIC_SITE_URL to https://<owner>.github.io/<repo>; on the custom
// domain set it to https://www.alohafootcareservices.ca.
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// GitHub Pages serves a project site from /<repo>/. next/link adds this
// automatically; use withBase() for plain URLs (redirects, auth emails).
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(path: string): string {
  return `${basePath}${path}`;
}

/** Absolute URL on this site, for links in emails from Supabase Auth. */
export function absoluteUrl(path: string): string {
  if (typeof window !== "undefined") return `${window.location.origin}${basePath}${path}`;
  return `${siteUrl}${path}`;
}
