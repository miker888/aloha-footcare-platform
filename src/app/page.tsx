import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SandRipples } from "@/components/SandRipples";
import { ServicePrices } from "@/components/ServicePrices";
import { conditions, partners, places, site, steps } from "@/lib/site";

export default function Home() {
  return (
    <div className="public">
      <SiteHeader />
      <main id="main">
        {/* Hero */}
        <section className="border-b border-dune">
          <div className="wrap grid items-stretch gap-0 lg:grid-cols-[1.05fr_1fr]">
            <div className="py-14 lg:py-24 lg:pr-12">
              <h1 className="text-[2.6rem] leading-[1.05] text-ink sm:text-[3.4rem] lg:text-[4.1rem]">
                Foot care from a nurse, in your own home.
              </h1>
              <p className="mt-6 max-w-[34rem] text-[1.25rem] leading-relaxed text-drift">
                Our licensed practical nurses bring advanced foot care to your home or seniors&apos; residence across
                Calgary and area. Each visit includes a check of your feet and takes about 30 to 45 minutes.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link
                  href="/book/"
                  className="inline-flex h-14 items-center rounded-full bg-clay px-8 text-[1.15rem] font-semibold text-shell hover:bg-clay-deep"
                >
                  Book a visit
                </Link>
                <a href={site.phone.href} className="text-[1.15rem] font-semibold text-ink underline decoration-dune-deep decoration-2 underline-offset-[6px] hover:decoration-clay">
                  or call {site.phone.display}
                </a>
              </div>
              <ul className="mt-10 grid gap-2 text-[1.05rem] text-ink sm:grid-cols-2">
                <li className="flex gap-2.5">
                  <Check /> Direct billing with Alberta Blue Cross
                </li>
                <li className="flex gap-2.5">
                  <Check /> Veterans Affairs Canada clients welcome
                </li>
                <li className="flex gap-2.5">
                  <Check /> Over 50 years of combined nursing experience
                </li>
                <li className="flex gap-2.5">
                  <Check /> More than 4,000 clients cared for
                </li>
              </ul>
            </div>

            <figure className="relative -mx-4 min-h-[280px] overflow-hidden sm:-mx-0 lg:my-0 lg:min-h-full">
              <SandRipples className="absolute inset-0 h-full w-full" />
              <figcaption className="absolute bottom-5 left-6 right-6 font-display text-[1.25rem] text-ink/80 lg:bottom-8 lg:left-8">
                {site.tagline}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* What we treat */}
        <section id="treat" className="wrap grid gap-10 py-20 lg:grid-cols-[0.8fr_1.6fr]">
          <div>
            <h2 className="text-[2.2rem] leading-tight text-ink">What we treat</h2>
            <p className="mt-4 max-w-sm text-drift">
              Foot problems that make walking painful or are hard to manage at home, especially with diabetes or poor
              circulation.
            </p>
          </div>
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {conditions.map((c) => (
              <div key={c.name} className="border-t border-dune py-5">
                <dt className="text-[1.3rem] font-semibold text-ink">{c.name}</dt>
                <dd className="mt-1.5 text-drift">{c.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How booking works */}
        <section id="how" className="border-y border-dune bg-shell">
          <div className="wrap py-20">
            <h2 className="text-[2.2rem] leading-tight text-ink">How booking works</h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="relative">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-clay font-display text-[1.4rem] text-clay">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-[1.45rem] text-ink">{s.title}</h3>
                  <p className="mt-2 max-w-xs text-drift">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Services and prices */}
        <section id="services" className="wrap grid gap-10 py-20 lg:grid-cols-[0.8fr_1.6fr]">
          <div>
            <h2 className="text-[2.2rem] leading-tight text-ink">Services and prices</h2>
            <p className="mt-4 max-w-sm text-drift">
              Payment holds your request. We then confirm your nurse and visit time with you.
            </p>
          </div>
          <div>
            <ServicePrices />
            <Link
              href="/book/"
              className="mt-8 inline-flex h-14 items-center rounded-full bg-clay px-8 text-[1.15rem] font-semibold text-shell hover:bg-clay-deep"
            >
              Book a visit
            </Link>
          </div>
        </section>

        {/* Where we go */}
        <section className="border-t border-dune">
          <div className="wrap py-20">
            <h2 className="text-[2.2rem] leading-tight text-ink">Where we go</h2>
            <div className="mt-10 grid gap-10 md:grid-cols-3">
              {places.map((p) => (
                <div key={p.title}>
                  <h3 className="text-[1.45rem] text-ink">{p.title}</h3>
                  <p className="mt-2 text-drift">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Residences and partners */}
        <section id="residences" className="bg-kelp text-shell">
          <div className="wrap grid gap-10 py-20 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="text-[2.2rem] leading-tight">Foot care for your residents</h2>
              <p className="mt-4 max-w-md text-shell/85">
                We run regular foot care days in seniors&apos; residences and care homes, and work alongside home care
                providers. Tell us how many residents need care and we&apos;ll plan the visits.
              </p>
              <a
                href={`mailto:${site.email}?subject=Foot%20care%20for%20our%20residents`}
                className="mt-8 inline-flex h-14 items-center rounded-full bg-shell px-8 text-[1.15rem] font-semibold text-kelp hover:bg-sand"
              >
                Email us about residents
              </a>
            </div>
            <div>
              <h3 className="text-[1.3rem]">Organizations we work with</h3>
              <ul className="mt-5 grid gap-x-8 gap-y-2.5 text-shell/90 sm:grid-cols-2">
                {partners.map((p) => (
                  <li key={p} className="border-b border-shell/15 pb-2.5">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-1 h-5 w-5 shrink-0 text-kelp" aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
