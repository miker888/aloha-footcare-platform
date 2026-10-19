import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BookingForm } from "./BookingForm";

export const metadata: Metadata = {
  title: "Book a visit",
  description: "Request a foot care visit at home or in your seniors' residence. Pay online to hold your request.",
};

export default function BookPage() {
  return (
    <div className="public">
      <SiteHeader minimal />
      <main id="main" className="wrap py-10 sm:py-14">
        <h1 className="text-[2.4rem] leading-tight text-ink sm:text-[3rem]">Book a foot care visit</h1>
        <p className="mt-3 max-w-2xl text-drift">
          Tell us what you need and when. Payment holds your request, then we confirm your nurse and visit time with
          you.
        </p>
        <Suspense fallback={<p className="mt-10 text-drift">Loading the booking form…</p>}>
          <BookingForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
