"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, supabase } from "@/lib/supabase";
import { dateISOInTZ, longDate, timeOnly, todayISO } from "@/lib/format";
import { concernLabel } from "@/lib/labels";
import type { MyVisit } from "@/lib/types";
import { useStaff } from "@/components/admin/AdminShell";
import { Button, Empty, Field, Loading, Notice, PageHeader, Pill, StatusPill, textareaClass } from "@/components/admin/ui";

export default function VisitsPage() {
  const staff = useStaff();
  const [visits, setVisits] = useState<MyVisit[] | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("my_visits");
    if (error) setFlash({ tone: "error", text: "Couldn't load your visits." });
    setVisits((data as MyVisit[]) ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const today = todayISO();
  const groups = useMemo(() => {
    const m = new Map<string, MyVisit[]>();
    (visits ?? []).forEach((v) => {
      const d = dateISOInTZ(new Date(v.scheduled_start));
      m.set(d, [...(m.get(d) ?? []), v]);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visits]);

  const upcoming = groups.filter(([d]) => d >= today);
  const past = groups.filter(([d]) => d < today).reverse();

  return (
    <div className="max-w-3xl">
      <PageHeader title="My visits">
        {staff.role === "admin" ? "Admins don't have a visit list. This page is for nurses." : "Your visits for the coming days, and the last week."}
      </PageHeader>
      {flash && (
        <div className="mt-5">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}
      {!visits ? (
        <Loading />
      ) : visits.length === 0 ? (
        <div className="mt-6">
          <Empty>No visits assigned to you right now.</Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {upcoming.map(([day, list]) => (
            <Day key={day} day={day} today={today} visits={list} onChanged={async (text) => { setFlash({ tone: "success", text }); await load(); }} onFail={async (e) => setFlash({ tone: "error", text: await errorMessage(e as { message?: string; code?: string }, "Couldn't update the visit.") })} />
          ))}
          {past.length > 0 && (
            <details className="rounded-xl border border-dune bg-shell p-4">
              <summary className="cursor-pointer font-semibold">Last 7 days</summary>
              <div className="mt-4 space-y-8">
                {past.map(([day, list]) => (
                  <Day key={day} day={day} today={today} visits={list} onChanged={async () => load()} onFail={async () => {}} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Day({
  day,
  today,
  visits,
  onChanged,
  onFail,
}: {
  day: string;
  today: string;
  visits: MyVisit[];
  onChanged: (text: string) => Promise<void>;
  onFail: (e: unknown) => Promise<void>;
}) {
  return (
    <section>
      <h2 className="font-sans text-[1.15rem] font-bold">{day === today ? `Today, ${longDate(day)}` : longDate(day)}</h2>
      <ul className="mt-3 space-y-3">
        {visits.map((v) => (
          <li key={v.id}>
            <VisitCard visit={v} onChanged={onChanged} onFail={onFail} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function VisitCard({ visit: v, onChanged, onFail }: { visit: MyVisit; onChanged: (t: string) => Promise<void>; onFail: (e: unknown) => Promise<void> }) {
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const open = v.status === "assigned" || v.status === "confirmed";
  const address = `${v.visit_address_line1}${v.visit_address_line2 ? `, ${v.visit_address_line2}` : ""}, ${v.visit_city} ${v.visit_postal_code ?? ""}`;

  async function close(status: "completed" | "no_show") {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("nurse_update_visit", { p_booking_id: v.id, p_status: status, p_visit_notes: note });
    setBusy(false);
    if (error) return onFail(error);
    await onChanged(status === "completed" ? `${v.reference} marked as completed.` : `${v.reference} marked as a no-show.`);
  }

  return (
    <article className="rounded-xl border border-dune bg-shell p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[1.2rem] font-bold">
            {timeOnly(v.scheduled_start)} to {timeOnly(v.scheduled_end)}
          </p>
          <p className="text-[1.1rem]">{v.client_name}</p>
        </div>
        <StatusPill status={v.status} />
      </div>
      <p className="mt-2">
        {v.residence_name && <span className="block font-semibold">{v.residence_name}</span>}
        <a className="text-palm underline underline-offset-4" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
          {address}
        </a>
      </p>
      <p className="mt-1">
        {v.client_phone && (
          <a href={`tel:${v.client_phone}`} className="text-palm underline underline-offset-4">
            {v.client_phone}
          </a>
        )}
        {v.contact_name && v.contact_name !== v.client_name && (
          <span className="block text-drift">
            Contact: {v.contact_name}
            {v.contact_relationship ? ` (${v.contact_relationship})` : ""}
            {v.contact_phone && (
              <>
                ,{" "}
                <a href={`tel:${v.contact_phone}`} className="text-palm underline underline-offset-4">
                  {v.contact_phone}
                </a>
              </>
            )}
          </span>
        )}
      </p>
      <p className="mt-2 font-semibold">{v.services.join(", ")}</p>
      {v.concerns.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.concerns.map((c) => (
            <Pill key={c} tone={c === "diabetic" ? "gold" : "sand"}>
              {concernLabel(c)}
            </Pill>
          ))}
        </div>
      )}
      {v.care_notes && <p className="mt-2 whitespace-pre-wrap"><span className="font-semibold">Care notes:</span> {v.care_notes}</p>}
      {v.client_notes && <p className="mt-1 whitespace-pre-wrap"><span className="font-semibold">From the client:</span> {v.client_notes}</p>}
      {v.visit_notes && <p className="mt-1 whitespace-pre-wrap text-drift"><span className="font-semibold">Your note:</span> {v.visit_notes}</p>}

      {open && (
        <div className="mt-4 border-t border-dune pt-3">
          {!closing ? (
            <Button variant="strong" size="sm" onClick={() => setClosing(true)}>
              Finish visit
            </Button>
          ) : (
            <div className="space-y-3">
              <Field label="Visit note (optional)" hint="For scheduling, like when the next visit is due. Not for clinical charting.">
                {(id) => <textarea id={id} rows={2} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="strong" size="sm" disabled={busy} onClick={() => void close("completed")}>
                  Mark completed
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void close("no_show")}>
                  Client wasn&apos;t there
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setClosing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
