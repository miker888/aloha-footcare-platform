import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default function NotFound() {
  return (
    <div className="public">
      <SiteHeader />
      <main className="wrap py-24">
        <h1 className="text-[2.6rem] text-ink">We couldn&apos;t find that page</h1>
        <p className="mt-4 max-w-xl text-drift">The link may be old, or the page may have moved.</p>
        <Link href="/" className="mt-8 inline-flex h-14 items-center rounded-full bg-palm px-8 text-[1.15rem] font-semibold text-shell hover:bg-palm-deep">
          Go to the home page
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
