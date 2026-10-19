"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, FUNCTION_REGION, supabase } from "@/lib/supabase";
import { ago, calgaryToISO, centsToDollars, dateTime, dollarsToCents, longDate, money, splitInTZ, timeOnly } from "@/lib/format";
import { concernLabel, insuranceLabel, METHOD, TXN_TYPE, windowLabel } from "@/lib/labels";
import type { BookingDetail, NurseLoad, Transaction } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import {
  Button,
  Field,
  inputClass,
  Loading,
  Notice,
  Panel,
  PaymentPill,
  Pill,
  StatusPill,
  textareaClass,
} from "@/components/admin/ui";

export default function BookingPage() {
  return (
    <AdminOnly>
      <Suspense fallback={<Loading />}>
        <BookingScreen />
      </Suspense>
    </AdminOnly>
  );
}

const DEFAULT_TIME = { morning: "09:00", afternoon: "13:00", any: "10:00" } as const;

function BookingScreen() {
  const id = useSearchParams().get("id") ?? "";
  const [detail, setDetail] = useState<BookingDetail | null | undefined>(undefined);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    const { data, error } = await supabase.rpc("booking_detail", { p_id: id });
    if (error) {
      setFlash({ tone: "error", text: "Couldn't load this booking." });
      setDetail(null);
      return;
    }
    setDetail((data as BookingDetail | null) ?? null);
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const done = useCallback(
    async (text: string) => {
      setFlash({ tone: "success", text });
      await load();
    },
    [load],
  );
  const fail = useCallback(async (err: unknown, fallback: string) => {
    setFlash({ tone: "error", text: await errorMessage(err as { message?: string; code?: string }, fallback) });
  }, []);

  if (!id) return <Notice tone="error">No booking selected.</Notice>;
  if (detail === undefined) return <Loading />;
  if (detail === null)
    return (
      <div className="space-y-4">
        <Notice tone="error">This booking doesn&apos;t exist, or your account can&apos;t see it.</Notice>
        <Link href="/admin/" className="font-semibold text-palm underline underline-offset-4">
          Back to dispatch
        </Link>
      </div>
    );

  const { booking: b, client: c } = detail;
  const forSomeoneElse = b.contact_name && b.contact_name !== `${c.first_name} ${c.last_name}`;

  return (
    <div>
      <Link href="/admin/" className="font-semibold text-palm underline-offset-4 hover:underline">
        Dispatch
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-dune pb-5">
        <h1 className="text-[1.9rem] leading-tight text-ink">
          {c.first_name} {c.last_name}
        </h1>
        <StatusPill status={b.status} />
        <PaymentPill status={b.payment_status} />
        <p className="w-full text-drift">
          {b.reference}, requested {ago(b.created_at)} {b.source === "online" ? "online" : b.source === "phone" ? "by phone" : ""}
        </p>
      </div>

      {flash && (
        <div className="mt-5">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Panel title="Visit">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Asked for">
                {longDate(b.preferred_date)}, {windowLabel(b.preferred_window).toLowerCase()}
                {b.alternate_date && <span className="block text-drift">or {longDate(b.alternate_date)}</span>}
              </Item>
              <Item label="Scheduled">{b.scheduled_start ? dateTime(b.scheduled_start) : <span className="text-drift">Not yet</span>}</Item>
              <Item label="Address">
                {b.residence_name && <span className="block font-semibold">{b.residence_name}</span>}
                <span className="block">
                  {b.visit_address_line1}
                  {b.visit_address_line2 ? `, ${b.visit_address_line2}` : ""}
                </span>
                <span className="block">
                  {b.visit_city} {b.visit_postal_code}
                </span>
                <a
                  className="text-[0.95rem] text-palm underline underline-offset-4"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.visit_address_line1}, ${b.visit_city} ${b.visit_postal_code ?? ""}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Maps
                </a>
              </Item>
              <Item label="Area">{detail.area?.name ?? <span className="text-drift">Not set</span>}</Item>
            </dl>
            <table className="mt-5 w-full text-left">
              <thead className="sr-only">
                <tr>
                  <th>Item</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dune border-y border-dune">
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">
                      {i.name}
                      {i.quantity > 1 ? ` x ${i.quantity}` : ""}
                      {i.payroll_code && <span className="ml-2 text-[0.85rem] text-drift">{i.payroll_code}</span>}
                    </td>
                    <td className="py-2 text-right">{money(i.line_total_cents)}</td>
                  </tr>
                ))}
                {b.tax_cents > 0 && (
                  <tr>
                    <td className="py-2">GST</td>
                    <td className="py-2 text-right">{money(b.tax_cents)}</td>
                  </tr>
                )}
                <tr className="font-bold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{money(b.total_cents)}</td>
                </tr>
              </tbody>
            </table>
          </Panel>

          <Panel title="Client" actions={<Link href={`/admin/client/?id=${c.id}`} className="font-semibold text-palm underline-offset-4 hover:underline">Client record</Link>}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Phone">
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="text-palm underline underline-offset-4">
                    {c.phone}
                  </a>
                ) : (
                  <span className="text-drift">None</span>
                )}
              </Item>
              <Item label="Email">
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="break-all text-palm underline underline-offset-4">
                    {c.email}
                  </a>
                ) : (
                  <span className="text-drift">None</span>
                )}
              </Item>
              {forSomeoneElse && (
                <Item label="Booked by" wide>
                  {b.contact_name}
                  {b.contact_relationship ? ` (${b.contact_relationship})` : ""}
                  {b.contact_phone && (
                    <>
                      ,{" "}
                      <a href={`tel:${b.contact_phone}`} className="text-palm underline underline-offset-4">
                        {b.contact_phone}
                      </a>
                    </>
                  )}
                  {b.contact_email && (
                    <>
                      ,{" "}
                      <a href={`mailto:${b.contact_email}`} className="break-all text-palm underline underline-offset-4">
                        {b.contact_email}
                      </a>
                    </>
                  )}
                </Item>
              )}
              <Item label="Insurance">{insuranceLabel(b.insurance)}</Item>
            </dl>
          </Panel>

          <Panel title="Health information">
            <dl className="grid gap-4">
              <Item label="Help with">
                {b.concerns.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {b.concerns.map((x) => (
                      <Pill key={x} tone={x === "diabetic" ? "gold" : "sand"}>
                        {concernLabel(x)}
                      </Pill>
                    ))}
                  </span>
                ) : (
                  <span className="text-drift">Nothing selected</span>
                )}
              </Item>
              <Item label="Note from the client">{b.client_notes ? <span className="whitespace-pre-wrap">{b.client_notes}</span> : <span className="text-drift">None</span>}</Item>
              <Item label="Care notes on file">{c.care_notes ? <span className="whitespace-pre-wrap">{c.care_notes}</span> : <span className="text-drift">None</span>}</Item>
              {b.visit_notes && <Item label="Nurse's visit note"><span className="whitespace-pre-wrap">{b.visit_notes}</span></Item>}
            </dl>
          </Panel>

          <StaffNotes key={`notes-${b.id}-${b.staff_notes ?? ""}`} detail={detail} onDone={done} onFail={fail} />
        </div>

        <div className="space-y-6">
          <DispatchPanel key={`dispatch-${b.id}-${b.status}-${b.nurse_id}-${b.scheduled_start}`} detail={detail} onDone={done} onFail={fail} />
          <PaymentsPanel detail={detail} onDone={done} onFail={fail} />
        </div>
      </div>
    </div>
  );
}

type ActionProps = {
  detail: BookingDetail;
  onDone: (text: string) => Promise<void>;
  onFail: (err: unknown, fallback: string) => Promise<void>;
};

function DispatchPanel({ detail, onDone, onFail }: ActionProps) {
  const b = detail.booking;
  const initial = splitInTZ(b.scheduled_start);
  const [date, setDate] = useState(initial.date || b.preferred_date);
  const [time, setTime] = useState(initial.time || DEFAULT_TIME[b.preferred_window]);
  const [duration, setDuration] = useState(String(b.duration_min ?? 45));
  const [nurseId, setNurseId] = useState(b.nurse_id ?? "");
  const [nurses, setNurses] = useState<NurseLoad[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!supabase || !date) return;
    let alive = true;
    supabase.rpc("nurse_day_load", { p_date: date, p_area_id: b.area_id }).then(({ data }) => {
      if (alive) setNurses((data as NurseLoad[]) ?? []);
    });
    return () => {
      alive = false;
    };
  }, [date, b.area_id]);

  const start = date && time ? new Date(calgaryToISO(date, time)).getTime() : null;
  const end = start ? start + Number(duration || 45) * 60_000 : null;
  const clash = useMemo(() => {
    if (!nurses || !nurseId || !start || !end) return null;
    const n = nurses.find((x) => x.id === nurseId);
    return (
      n?.visits.find(
        (v) =>
          v.id !== b.id &&
          v.status !== "completed" &&
          new Date(v.scheduled_start).getTime() < end &&
          new Date(v.scheduled_end).getTime() > start,
      ) ?? null
    );
  }, [nurses, nurseId, start, end, b.id]);

  const closed = ["completed", "cancelled", "no_show"].includes(b.status);

  async function update(patch: Record<string, unknown>, message: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("bookings").update(patch).eq("id", b.id);
    setBusy(false);
    if (error) return onFail(error, "Couldn't save the change.");
    await onDone(message);
  }

  const schedule = () => ({
    nurse_id: nurseId || null,
    scheduled_start: date && time ? calgaryToISO(date, time) : null,
    duration_min: Number(duration) || 45,
  });

  return (
    <Panel title="Dispatch">
      {b.status === "awaiting_payment" && (
        <div className="mb-4 space-y-3">
          <Notice tone="info">This request hasn&apos;t been paid, so it isn&apos;t in the queue yet.</Notice>
          <Button variant="secondary" disabled={busy} onClick={() => update({ status: "new" }, "Moved into the queue.")}>
            Move into the queue without payment
          </Button>
        </div>
      )}

      {!closed && (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Field label="Date">
              {(fid) => <input id={fid} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field label="Time">
              {(fid) => <input id={fid} type="time" step={900} className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />}
            </Field>
            <Field label="Minutes">
              {(fid) => (
                <input id={fid} type="number" min={5} max={480} step={5} className={`${inputClass} w-20`} value={duration} onChange={(e) => setDuration(e.target.value)} />
              )}
            </Field>
          </div>

          <fieldset>
            <legend className="text-[0.95rem] font-semibold text-ink">Nurse</legend>
            {!nurses ? (
              <p className="mt-2 text-drift">Loading nurses…</p>
            ) : nurses.length === 0 ? (
              <p className="mt-2 text-drift">No active nurses. Add one under Nurses.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {nurses.map((n) => (
                  <li key={n.id}>
                    <label
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${nurseId === n.id ? "border-palm bg-leaf/60" : "border-dune hover:border-dune-deep"}`}
                    >
                      <input type="radio" name="nurse" className="mt-1 h-5 w-5 accent-palm" checked={nurseId === n.id} onChange={() => setNurseId(n.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">
                            {n.full_name}, {n.designation}
                          </span>
                          {n.covers_area ? <Pill tone="palm">Covers this area</Pill> : <Pill tone="drift">Outside usual areas</Pill>}
                        </span>
                        <span className="block text-[0.9rem] text-drift">
                          {n.visit_count === 0
                            ? "No visits that day"
                            : `${n.visit_count} visit${n.visit_count === 1 ? "" : "s"} that day: ${n.visits
                                .map((v) => `${timeOnly(v.scheduled_start)}${v.area_name ? ` ${v.area_name}` : ""}`)
                                .join(", ")}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {clash && (
            <Notice tone="error">
              That overlaps with {clash.reference} at {timeOnly(clash.scheduled_start)}. Pick another time or nurse.
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            {(b.status === "new" || b.status === "awaiting_payment") && (
              <Button variant="secondary" disabled={busy || !nurseId || !!clash} onClick={() => update({ ...schedule(), status: "assigned" }, "Nurse assigned. Call the client to confirm the time.")}>
                Assign nurse
              </Button>
            )}
            {b.status === "assigned" && (
              <Button variant="secondary" disabled={busy || !nurseId || !!clash} onClick={() => update({ ...schedule() }, "Changes saved.")}>
                Save changes
              </Button>
            )}
            {b.status !== "confirmed" ? (
              <Button variant="strong" disabled={busy || !nurseId || !!clash} onClick={() => update({ ...schedule(), status: "confirmed" }, "Visit confirmed.")}>
                {b.status === "assigned" ? "Client confirmed" : "Assign and confirm"}
              </Button>
            ) : (
              <Button variant="secondary" disabled={busy || !nurseId || !!clash} onClick={() => update({ ...schedule() }, "Changes saved.")}>
                Save changes
              </Button>
            )}
          </div>

          {b.status === "confirmed" && (
            <div className="flex flex-wrap gap-2 border-t border-dune pt-4">
              <Button variant="strong" disabled={busy} onClick={() => update({ status: "completed" }, "Marked as completed.")}>
                Mark completed
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => update({ status: "no_show" }, "Marked as a no-show.")}>
                No-show
              </Button>
              <Button variant="quiet" disabled={busy} onClick={() => update({ status: "assigned" }, "Moved back to waiting to confirm.")}>
                Unconfirm
              </Button>
            </div>
          )}

          <div className="border-t border-dune pt-4">
            {!cancelling ? (
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel booking
              </Button>
            ) : (
              <div className="space-y-3">
                <Field label="Reason for cancelling">
                  {(fid) => <input id={fid} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
                </Field>
                <div className="flex gap-2">
                  <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => update({ status: "cancelled", cancel_reason: reason.trim() }, "Booking cancelled. Refund any payment below if needed.")}>
                    Cancel booking
                  </Button>
                  <Button variant="quiet" onClick={() => setCancelling(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {closed && (
        <div className="space-y-3">
          {b.status === "completed" && <p>Completed {b.completed_at ? dateTime(b.completed_at) : ""}{detail.nurse ? ` by ${detail.nurse.full_name}` : ""}.</p>}
          {b.status === "no_show" && <p>Marked as a no-show{detail.nurse ? ` (${detail.nurse.full_name})` : ""}.</p>}
          {b.status === "cancelled" && (
            <p>
              Cancelled {b.cancelled_at ? dateTime(b.cancelled_at) : ""}. Reason: {b.cancel_reason}
            </p>
          )}
          {b.status !== "completed" && (
            <Button variant="secondary" disabled={busy} onClick={() => update({ status: "new" }, "Booking reopened and back in the queue.")}>
              Reopen
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

function PaymentsPanel({ detail, onDone, onFail }: ActionProps) {
  const b = detail.booking;
  const txns = detail.transactions;
  const net = txns.reduce((sum, t) => sum + t.amount_cents, 0);
  const paid = txns.filter((t) => t.type === "payment").reduce((s, t) => s + t.amount_cents, 0);
  const refunded = -txns.filter((t) => t.type === "refund").reduce((s, t) => s + t.amount_cents, 0);
  // A refund settles that part of the bill, so only show a balance when nothing was refunded.
  const due = refunded > 0 ? 0 : b.total_cents - net;
  const cardNet = txns.filter((t) => t.method === "card" || t.method === "demo").reduce((s, t) => s + t.amount_cents, 0);

  const [mode, setMode] = useState<"none" | "payment" | "refund" | "card-refund">("none");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Transaction["method"]>("etransfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function open(m: typeof mode) {
    setMode(m);
    setNote("");
    if (m === "payment") {
      setAmount(due > 0 ? centsToDollars(due) : "");
      setMethod("etransfer");
    }
    if (m === "refund") {
      setAmount("");
      setMethod("etransfer");
    }
    if (m === "card-refund") setAmount(cardNet > 0 ? centsToDollars(cardNet) : "");
  }

  async function save() {
    if (!supabase) return;
    const cents = dollarsToCents(amount);
    if (!cents || cents <= 0) return onFail(null, "Enter an amount, like 75.00.");
    setBusy(true);
    if (mode === "card-refund") {
      if (!note.trim()) {
        setBusy(false);
        return onFail(null, "Add a reason for the refund.");
      }
      const { data, error } = await supabase.functions.invoke("refund-payment", {
        body: { booking_id: b.id, amount_cents: cents, reason: note.trim(), request_id: crypto.randomUUID() },
        region: FUNCTION_REGION,
      });
      setBusy(false);
      if (error) return onFail(error, "The refund didn't go through.");
      setMode("none");
      return onDone(data?.status === "succeeded" ? `Refunded ${money(cents)}.` : `Refund of ${money(cents)} is ${data?.status ?? "processing"}. It will show here once Stripe confirms it.`);
    }
    const { error } = await supabase.from("transactions").insert({
      booking_id: b.id,
      type: mode === "refund" ? "refund" : "payment",
      method,
      amount_cents: mode === "refund" ? -cents : cents,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return onFail(error, "Couldn't record that.");
    setMode("none");
    await onDone(mode === "refund" ? `Refund of ${money(cents)} recorded.` : `Payment of ${money(cents)} recorded.`);
  }

  return (
    <Panel title="Payments">
      {txns.length === 0 ? (
        <p className="text-drift">No payments yet.</p>
      ) : (
        <ul className="divide-y divide-dune">
          {txns.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 py-2">
              <span>
                <span className="block font-semibold text-ink">
                  {TXN_TYPE[t.type]}, {METHOD[t.method]}
                </span>
                <span className="block text-[0.9rem] text-drift">{dateTime(t.occurred_at)}</span>
                {t.note && <span className="block text-[0.9rem] text-drift">{t.note}</span>}
              </span>
              <span className={`font-semibold ${t.amount_cents < 0 ? "text-alert" : "text-ink"}`}>{money(t.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-3 space-y-1 border-t border-dune pt-3">
        {refunded > 0 && (
          <>
            <div className="flex justify-between">
              <dt>Paid</dt>
              <dd>{money(paid)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Refunded</dt>
              <dd>{money(-refunded)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between font-bold">
          <dt>{refunded > 0 ? "Net paid" : due > 0 ? "Balance due" : due < 0 ? "Overpaid" : "Balance"}</dt>
          <dd>{money(refunded > 0 ? net : Math.abs(due))}</dd>
        </div>
      </dl>

      {mode === "none" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => open("payment")}>
            Record a payment
          </Button>
          {cardNet > 0 && (
            <Button variant="secondary" size="sm" onClick={() => open("card-refund")}>
              Refund card payment
            </Button>
          )}
          <Button variant="quiet" size="sm" onClick={() => open("refund")}>
            Record a cash or e-transfer refund
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3 rounded-lg border border-dune bg-sand/60 p-3">
          <p className="font-semibold text-ink">
            {mode === "payment" ? "Record a payment" : mode === "refund" ? "Record a refund paid outside Stripe" : "Refund to the client's card"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount ($)">
              {(fid) => <input id={fid} inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
            {mode !== "card-refund" && (
              <Field label="Method">
                {(fid) => (
                  <select id={fid} className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as Transaction["method"])}>
                    <option value="etransfer">E-transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="insurance">Insurance</option>
                    {mode === "payment" && <option value="card">Card (terminal)</option>}
                    <option value="other">Other</option>
                  </select>
                )}
              </Field>
            )}
          </div>
          <Field label={mode === "card-refund" ? "Reason" : "Note (optional)"}>
            {(fid) => <input id={fid} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {mode === "card-refund" && <p className="text-[0.9rem] text-drift">Up to {money(cardNet)} can go back to the card.</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : mode === "card-refund" ? "Refund" : "Save"}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function StaffNotes({ detail, onDone, onFail }: ActionProps) {
  const [notes, setNotes] = useState(detail.booking.staff_notes ?? "");
  const [busy, setBusy] = useState(false);
  const changed = notes !== (detail.booking.staff_notes ?? "");
  return (
    <Panel title="Office notes">
      <label htmlFor="staff-notes" className="sr-only">
        Office notes
      </label>
      <textarea id="staff-notes" rows={3} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only staff see these." />
      <div className="mt-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!changed || busy}
          onClick={async () => {
            if (!supabase) return;
            setBusy(true);
            const { error } = await supabase.from("bookings").update({ staff_notes: notes.trim() || null }).eq("id", detail.booking.id);
            setBusy(false);
            if (error) return onFail(error, "Couldn't save the notes.");
            await onDone("Notes saved.");
          }}
        >
          Save notes
        </Button>
      </div>
    </Panel>
  );
}

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-[0.9rem] font-semibold text-drift">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
