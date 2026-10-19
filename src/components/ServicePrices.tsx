"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";

// Live from the catalog, so a price change in the admin shows up here at once.
export function ServicePrices() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase
      .from("catalog_items")
      .select("*")
      .eq("kind", "service")
      .eq("bookable_online", true)
      .eq("active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setFailed(true);
        else setItems(data as CatalogItem[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-drift">
        Prices are shown when you <Link href="/book/" className="text-palm underline underline-offset-4">book a visit</Link>, or call us and we&apos;ll go through them with you.
      </p>
    );
  }

  if (!items) {
    return (
      <ul className="divide-y divide-dune border-y border-dune" aria-busy="true">
        {[0, 1].map((i) => (
          <li key={i} className="py-6">
            <div className="h-6 w-2/3 rounded bg-dune/70" />
            <div className="mt-3 h-4 w-1/2 rounded bg-dune/50" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="divide-y divide-dune border-y border-dune">
      {items.map((item) => (
        <li key={item.id} className="grid gap-x-8 gap-y-1 py-6 sm:grid-cols-[1fr_auto]">
          <div>
            <h3 className="text-[1.45rem] text-ink">{item.name}</h3>
            {item.description && <p className="mt-1 max-w-[60ch] text-drift">{item.description}</p>}
          </div>
          <p className="sm:text-right">
            <span className="font-display text-[1.6rem] text-palm">{money(item.price_cents)}</span>
            {item.duration_min && <span className="block text-[1rem] text-drift">about {item.duration_min} minutes</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}
