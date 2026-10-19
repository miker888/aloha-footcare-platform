import Link from "next/link";
import { Logo } from "./Logo";
import { site } from "@/lib/site";

export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  return (
    <header className="border-b border-dune bg-sand/95 backdrop-blur supports-[backdrop-filter]:bg-sand/80 sticky top-0 z-30">
      <div className="wrap flex h-20 items-center justify-between gap-4 sm:h-[104px]">
        <Link href="/" className="shrink-0 rounded-md" aria-label={`${site.name}, home`}>
          <Logo alt="" className="h-16 w-auto sm:h-[88px]" />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {!minimal && (
            <ul className="mr-2 hidden items-center gap-1 lg:flex">
              <li>
                <Link href="/#treat" className="rounded-md px-3 py-2 text-[1.05rem] text-ink hover:text-palm">
                  What we treat
                </Link>
              </li>
              <li>
                <Link href="/#how" className="rounded-md px-3 py-2 text-[1.05rem] text-ink hover:text-palm">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#residences" className="rounded-md px-3 py-2 text-[1.05rem] text-ink hover:text-palm">
                  Residences
                </Link>
              </li>
            </ul>
          )}
          <a
            href={site.phone.href}
            className="hidden rounded-md px-3 py-2 text-[1.05rem] font-semibold text-ink hover:text-palm sm:inline-block"
          >
            {site.phone.display}
          </a>
          <a
            href={site.phone.href}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full text-ink hover:bg-dune sm:hidden"
            aria-label={`Call ${site.phone.display}`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path
                d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1Z"
                fill="currentColor"
              />
            </svg>
          </a>
          {!minimal && (
            <Link
              href="/book/"
              className="inline-flex h-12 items-center whitespace-nowrap rounded-full bg-palm px-4 text-[1.05rem] font-semibold text-shell hover:bg-palm-deep sm:px-5"
            >
              Book a visit
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
