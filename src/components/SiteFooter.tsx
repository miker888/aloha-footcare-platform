import Link from "next/link";
import { Logo } from "./Logo";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-dune bg-shell">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-drift">{site.tagline}</p>
          <p className="mt-4 text-[1rem] text-drift">Proudly Canadian owned and operated.</p>
        </div>

        <div>
          <h2 className="text-xl text-ink">Contact</h2>
          <ul className="mt-3 space-y-1.5">
            <li>
              <a href={site.phone.href} className="font-semibold text-clay underline-offset-4 hover:underline">
                {site.phone.display}
              </a>
            </li>
            <li>
              <a href={site.phoneAlt.href} className="text-ink underline-offset-4 hover:underline">
                {site.phoneAlt.display}
              </a>
            </li>
            <li>
              <a href={`mailto:${site.email}`} className="break-all text-ink underline-offset-4 hover:underline">
                {site.email}
              </a>
            </li>
          </ul>
          <address className="mt-4 not-italic text-drift">
            {site.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>

        <div>
          <h2 className="text-xl text-ink">Visit us online</h2>
          <ul className="mt-3 space-y-1.5">
            <li>
              <Link href="/book/" className="text-ink underline-offset-4 hover:underline">
                Book a visit
              </Link>
            </li>
            <li>
              <Link href="/privacy/" className="text-ink underline-offset-4 hover:underline">
                Privacy and your health information
              </Link>
            </li>
            <li>
              <a href={site.social.facebook} className="text-ink underline-offset-4 hover:underline">
                Facebook
              </a>
            </li>
            <li>
              <a href={site.social.instagram} className="text-ink underline-offset-4 hover:underline">
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-dune">
        <div className="wrap flex flex-col justify-between gap-2 py-5 text-[0.95rem] text-drift sm:flex-row">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <Link href="/admin/" className="underline-offset-4 hover:underline">
            Staff sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
