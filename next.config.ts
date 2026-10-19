import type { NextConfig } from "next";

// Static export, same setup as the Aspire and Vulture sites. Server logic lives
// in Supabase (database functions and Edge Functions), not in Next.js.
// GitHub Pages serves a project site from /<repo-name>/, so the deploy workflow
// sets NEXT_PUBLIC_BASE_PATH. Leave it empty once the site is on its own domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
