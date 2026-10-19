"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ago, dateISOInTZ, dateTime, money, shortDate, todayISO } from "@/lib/format";
import { windowLabel } from "@/lib/labels";
import type { DispatchRow } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { Button, ButtonLink, Empty, inlineInputClass, Loading, Notice, PageHeader, PaymentPill, Pill } from "@/components/admin/ui";

const COLUMNS = [
  { status: "new", title: "Needs a nurse", hint: "Paid requests waiting to be matched." },
  { status: "assigned", title: "Waiting to confirm", hint: "Nurse and time picked. Call the client to confirm." },
  { status: "confirmed", title: "Confirmed", hint: "Upcoming visits, soonest first." },
] as const;

export default function DispatchPage() {
  return (
    <AdminOnly>
      <Dispatch />
    </AdminOnly>
  );
}

function Dispatch() {
  const [rows, setRows] = useState<DispatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "unpaid">("queue");
  const [area, setArea] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: e } = await supabase.rpc("dispatch_board");
    if (e) setError("Couldn't load the dispatch board. Refresh to try again.");
    else {
      setError(null);
      setRows(data as DispatchRow[]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [load]);

  const areas = useMemo(() => {
    const names = new Map<string, string>();
    rows?.forEach((r) => r.area_id && r.area_name && names.set(r.area_id, r.area_name));
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!area || r.area_id === area) &&
        (!needle || r.client_name.toLowerCase().includes(needle) || r.reference.toLowerCase().includes(needle)),
    );
  }, [rows, area, q]);

  const unpaid = filtered.filter((r) => r.status === "awaiting_payment");
  const today = todayISO();
  const todayCount = (rows ?? []).filter(
    (r) => r.status === "confirmed" && r.scheduled_start && dateISOInTZ(new Date(r.scheduled_start)) === today,
  ).length;

  return (
    <div>
      <PageHeader
        title="Dispatch"
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
            <ButtonLink href="/admin/new-booking/">New phone booking</ButtonLink>
          </>
        }
      >
        Every request lands here first. Match a nurse, confirm the time with the client, then it moves across.
        {rows && todayCount > 0 && ` ${todayCount} confirmed visit${todayCount === 1 ? "" : "s"} today.`}
      </PageHeader>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="View" className="flex rounded-lg border border-dune-deep bg-shell p-1">
          <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
            Queue
          </TabButton>
          <TabButton active={tab === "unpaid"} onClick={() => setTab("unpaid")}>
            Unpaid requests{rows ? ` (${(rows ?? []).filter((r) => r.status === "awaiting_payment").length})` : ""}
          </TabButton>
        </div>
        <label className="sr-only" htmlFor="dispatch-area">
          Area
        </label>
        <select id="dispatch-area" className={`${inlineInputClass} min-w-[11rem]`} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {areas.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="dispatch-search">
          Search by client or reference
        </label>
        <input
          id="dispatch-search"
          className={`${inlineInputClass} w-full max-w-xs`}
          placeholder="Search client or AL-…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-6">
        {error && <Notice tone="error">{error}</Notice>}
        {!rows && !error && <Loading />}
        {rows && tab === "queue" && (
          <div className="grid gap-5 xl:grid-cols-3">
            {COLUMNS.map((col) => {
              const items = filtered.filter((r) => r.status === col.status);
              return (
                <section key={col.status} aria-labelledby={`col-${col.status}`} className="min-w-0">
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <h2 id={`col-${col.status}`} className="font-sans text-[1.1rem] font-bold text-ink">
                      {col.title}
                      <span className="ml-2 rounded-full bg-dune px-2 py-0.5 text-[0.85rem] text-drift">{items.length}</span>
                    </h2>
                  </div>
                  <p className="mb-3 text-[0.9rem] text-drift">{col.hint}</p>
                  {items.length === 0 ? (
                    <Empty>Nothing here.</Empty>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((r) => (
                        <li key={r.id}>
                          <Card row={r} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
        {rows && tab === "unpaid" && (
          <div>
            <p className="mb-4 max-w-2xl text-drift">
              Requests started online in the last 14 days where the payment wasn&apos;t completed. They aren&apos;t in the
              queue. Call to follow up, or record a payment to move one into the queue.
            </p>
            {unpaid.length === 0 ? (
              <Empty>No unpaid requests.</Empty>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {unpaid.map((r) => (
                  <li key={r.id}>
                    <Card row={r} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ row }: { row: DispatchRow }) {
  const where = [row.area_name, row.residence_name].filter(Boolean).join(", ");
  return (
    <Link
      href={`/admin/booking/?id=${row.id}`}
      className="block rounded-xl border border-dune bg-shell p-4 hover:border-palm focus-visible:border-palm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[1.1rem] font-bold text-ink">{row.client_name}</p>
          <p className="text-[0.9rem] text-drift">
            {row.reference}, requested {ago(row.created_at)}
            {row.source === "phone" ? " by phone" : ""}
          </p>
        </div>
        {row.payment_status !== "paid" && <PaymentPill status={row.payment_status} />}
      </div>

      <p className="mt-3 font-semibold text-ink">
        {row.scheduled_start ? (
          dateTime(row.scheduled_start)
        ) : (
          <>
            Asked for {shortDate(row.preferred_date)}, {windowLabel(row.preferred_window).toLowerCase()}
            {row.alternate_date && <span className="font-normal text-drift"> (or {shortDate(row.alternate_date)})</span>}
          </>
        )}
      </p>
      <p className="mt-1 text-drift">{row.services.join(", ")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {where && <Pill tone="sand">{where}</Pill>}
        {row.nurse_name && <Pill tone="palm">{row.nurse_name}</Pill>}
        {row.insurance !== "none" && <Pill tone="drift">Insurance</Pill>}
        <span className="ml-auto text-[0.9rem] text-drift">{money(row.total_cents)}</span>
      </div>
    </Link>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-semibold ${active ? "bg-palm text-shell" : "text-ink hover:text-palm"}`}
    >
      {children}
    </button>
  );
}
