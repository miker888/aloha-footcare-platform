"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { site, steps } from "@/lib/site";

// Shows only the reference from the URL. Nothing about the visit is loaded
// here, so the link reveals nothing if it's shared or left open.
export function Confirmation() {
  const params = useSearchParams();
  const ref = params.get("ref");
  const demo = params.get("demo") === "1";

  return (
    <div className="max-w-2xl">
      {demo && (
        <p className="mb-6 inline-block rounded-full bg-gold-wash px-4 py-1.5 text-[1rem] font-semibold text-gold-deep">
          Demo mode: no card was charged
        </p>
      )}
      <h1 className="text-[2.6rem] leading-tight text-ink sm:text-[3.2rem]">Thank you, we have your request</h1>
      {ref && (
        <p className="mt-4 text-[1.25rem] text-ink">
          Your reference is <strong className="font-semibold">{ref}</strong>.
        </p>
      )}
      {!demo && <p className="mt-3 text-drift">A payment receipt is on its way to your email.</p>}

      <h2 className="mt-12 text-[1.8rem] text-ink">What happens next</h2>
      <ol className="mt-6 space-y-6">
        {steps.slice(1).map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-gold font-display text-[1.2rem] text-gold-deep">
              {i + 1}
            </span>
            <span>
              <span className="block text-[1.25rem] font-semibold text-ink">{s.title}</span>
              <span className="block text-drift">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-12 text-drift">
        Need to change something? Call us at{" "}
        <a href={site.phone.href} className="font-semibold text-palm underline underline-offset-4">
          {site.phone.display}
        </a>
        {ref ? ` and mention ${ref}.` : "."}
      </p>
      <Link href="/" className="mt-8 inline-flex h-14 items-center rounded-full border-2 border-palm px-8 text-[1.1rem] font-semibold text-palm hover:bg-shell">
        Back to the home page
      </Link>
    </div>
  );
}
