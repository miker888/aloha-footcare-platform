import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Confirmation } from "./Confirmation";

export const metadata: Metadata = {
  title: "Request received",
  robots: { index: false, follow: false },
};

export default function ConfirmedPage() {
  return (
    <div className="public">
      <SiteHeader minimal />
      <main id="main" className="wrap py-14 sm:py-20">
        <Suspense fallback={<h1 className="text-[2.6rem] text-ink">Request received</h1>}>
          <Confirmation />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
