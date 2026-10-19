import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { site } from "@/lib/site";
import { siteUrl } from "@/lib/url";

// Self-hosted: no request to Google at build or run time.
const youngSerif = localFont({
  variable: "--font-young-serif",
  display: "swap",
  src: [{ path: "../fonts/young-serif-latin-400-normal.woff2", weight: "400", style: "normal" }],
});

// Atkinson Hyperlegible Next, designed by the Braille Institute for low-vision readers.
const atkinson = localFont({
  variable: "--font-atkinson",
  display: "swap",
  src: [
    { path: "../fonts/atkinson-hyperlegible-next-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/atkinson-hyperlegible-next-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/atkinson-hyperlegible-next-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/atkinson-hyperlegible-next-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title: {
    default: `${site.name} | Mobile foot care nurses in Calgary`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: `${site.name} | Mobile foot care nurses in Calgary`,
    description: site.description,
    siteName: site.name,
    locale: "en_CA",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f5eddf",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables sit on <html> so the theme tokens on :root can use them.
    <html lang="en-CA" className={`${youngSerif.variable} ${atkinson.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
