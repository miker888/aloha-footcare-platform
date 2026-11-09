import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { isDemo } from "@/lib/demo/flag";

export const metadata: Metadata = {
  title: "Prototype tour",
  description: "A guided walk through the prototype of Aloha Footcare's new website and office system.",
  robots: { index: false, follow: false },
};

type Stop = { title: string; text: string; href?: string; action?: string; tip?: string };

const stops: Stop[] = [
  {
    title: "Book a visit the way a family does",
    text: "Four short steps: the service and area, where and when, who the visit is for, then review and pay. The price comes from the clinic's own price list, travel charge included. Payment is simulated here.",
    href: "/book/",
    action: "Book a visit",
    tip: "Try booking for someone else, in Airdrie, with Diabetes ticked.",
  },
  {
    title: "Open the office queue",
    text: "Every request lands in one queue before anyone is assigned. Nothing goes to a nurse until the office decides.",
    href: "/admin/login/?as=office",
    action: "Sign in as the office",
    tip: "Your booking is waiting under “Needs a nurse”.",
  },
  {
    title: "Assign a nurse and confirm the time",
    text: "Open the booking. Nurses who cover that area come first, with how busy their day already is. The system won't let two visits overlap for the same nurse. Then confirm the time with the client and mark it confirmed.",
  },
  {
    title: "See the nurse's day",
    text: "Nurses see only their own visits, with the address, concerns and notes they need at the door, and mark each visit done.",
    href: "/admin/login/?as=nurse",
    action: "Sign in as Leilani",
  },
  {
    title: "Try the rest of the office",
    text: "Take a phone booking, change a price (the website updates straight away), refund part of a payment, or download the payments and payroll lists for the bookkeeper.",
    href: "/admin/login/?as=office",
    action: "Back to the office",
  },
];

const later = [
  "Email and text reminders",
  "Moving clients over from Vagaro",
  "Planning each nurse's route",
  "Clinical charting (still to decide)",
  "Real card payments, once the clinic's Stripe account is set up",
  "Two-step sign-in codes, once the clinic's own secure database is connected",
];

export default function TourPage() {
  if (!isDemo) notFound();

  return (
    <div className="public">
      <SiteHeader />
      <main id="main" className="wrap py-14 sm:py-20">
        <div className="max-w-[44rem]">
          <h1 className="text-[2.6rem] leading-tight text-ink sm:text-[3rem]">Try the new Aloha system</h1>
          <p className="mt-5 text-[1.25rem] text-ink">
            A working prototype of the new website and office system: online booking, one queue for every request,
            nurse assignment, payments and the nurse&apos;s view.
          </p>
          <p className="mt-4 text-drift">
            It runs entirely in your web browser, with made-up clients, nurses and bookings. Nothing you do here
            reaches anyone and no card is ever charged. Your changes stay on this device until you choose{" "}
            <strong className="font-semibold text-ink">Start over</strong> in the green bar at the top.
          </p>
        </div>

        <ol className="mt-14 max-w-[52rem] space-y-10">
          {stops.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[3rem_1fr] gap-x-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold font-display text-[1.4rem] text-gold-deep">
                {i + 1}
              </span>
              <div>
                <h2 className="pt-1.5 text-[1.6rem] leading-tight text-ink">{s.title}</h2>
                <p className="mt-2 text-drift">{s.text}</p>
                {s.tip && <p className="mt-2 text-[1.05rem] text-ink">{s.tip}</p>}
                {s.href && (
                  <Link
                    href={s.href}
                    className="mt-4 inline-flex h-12 items-center rounded-full bg-palm px-6 text-[1.05rem] font-semibold text-shell hover:bg-palm-deep"
                  >
                    {s.action}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-16 max-w-[44rem] rounded-2xl border border-dune bg-shell p-6 sm:p-8">
          <h2 className="text-[1.6rem] text-ink">Not in the prototype yet</h2>
          <ul className="mt-4 list-disc space-y-1.5 pl-6 text-drift">
            {later.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
