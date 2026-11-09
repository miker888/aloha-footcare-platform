"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { isDemo } from "@/lib/demo/flag";
import { demoStatus, onDemoStatus, startOver } from "@/lib/demo/state";

const link =
  "rounded px-2 py-1 font-semibold text-shell underline decoration-gold underline-offset-4 hover:text-gold-wash focus-visible:outline-shell";

/** The strip across the top of every page in the prototype build. Renders nothing otherwise. */
export function DemoBanner() {
  const status = useSyncExternalStore(onDemoStatus, demoStatus, () => "idle" as const);
  const [confirming, setConfirming] = useState(false);
  if (!isDemo) return null;

  return (
    <div role="region" aria-label="About this prototype" className="bg-palm-deep text-[0.95rem] leading-snug text-shell">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2">
        <p className="py-1">
          <strong className="font-semibold">Prototype</strong> with made-up clients. No real bookings or payments.
          {status === "loading" && <span className="ml-2 text-gold-wash">Loading the sample data…</span>}
          {status === "error" && <span className="ml-2 text-blush">The sample data didn&apos;t load. Reload the page.</span>}
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Start over">
            <span className="mr-1">Erase everything you&apos;ve changed?</span>
            <button type="button" className={link} onClick={startOver}>
              Yes, start over
            </button>
            <button type="button" className={link} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <nav aria-label="Prototype" className="-mx-2 flex flex-wrap items-center gap-1">
            <Link href="/tour/" className={link}>
              Guided tour
            </Link>
            <Link href="/admin/login/" className={link}>
              Staff sign-in
            </Link>
            <button type="button" className={link} onClick={() => setConfirming(true)}>
              Start over
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
