"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { errorMessage, supabase } from "@/lib/supabase";
import { calgaryToISO, money, todayISO } from "@/lib/format";
import { CONCERNS, INSURANCE, WINDOWS } from "@/lib/labels";
import type { CatalogItem, ClientDetail, ClientRow, Insurance, Quote, ServiceArea, VisitWindow } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { Button, Check, Field, inputClass, Loading, Notice, PageHeader, Panel, textareaClass } from "@/components/admin/ui";

export default function NewBookingPage() {
  return (
    <AdminOnly>
      <Suspense fallback={<Loading />}>
        <NewBooking />
      </Suspense>
    </AdminOnly>
  );
}

type NewClient = { first_name: string; last_name: string; phone: string; email: string; care_notes: string };

function NewBooking() {
  const router = useRouter();
  const preselect = useSearchParams().get("client");

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [nurses, setNurses] = useState<{ id: string; full_name: string }[]>([]);

  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ClientRow[]>([]);
  const [client, setClient] = useState<ClientDetail["client"] | null>(null);
  const [newClient, setNewClient] = useState<NewClient>({ first_name: "", last_name: "", phone: "", email: "", care_notes: "" });

  const [qty, setQty] = useState<Record<string, number>>({});
  const [areaId, setAreaId] = useState("");
  const [visit, setVisit] = useState({ location_type: "home", residence_name: "", address_line1: "", address_line2: "", city: "", postal_code: "" });
  const [date, setDate] = useState(todayISO());
  const [win, setWin] = useState<VisitWindow>("any");
  const [concerns, setConcerns] = useState<string[]>([]);
  const [clientNotes, setClientNotes] = useState("");
  const [staffNotes, setStaffNotes] = useState("");
  const [insurance, setInsurance] = useState<Insurance>("none");
  const [contact, setContact] = useState({ name: "", phone: "", email: "", relationship: "" });
  const [scheduleNow, setScheduleNow] = useState(false);
  const [nurseId, setNurseId] = useState("");
  const [time, setTime] = useState("10:00");
  const [confirmNow, setConfirmNow] = useState(true);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("catalog_items").select("*").eq("active", true).order("kind").order("sort_order"),
      supabase.from("service_areas").select("*").eq("active", true).order("sort_order"),
      supabase.from("nurses").select("id, full_name").eq("active", true).order("full_name"),
    ]).then(([c, a, n]) => {
      setCatalog((c.data as CatalogItem[]) ?? []);
      setAreas((a.data as ServiceArea[]) ?? []);
      setNurses((n.data as { id: string; full_name: string }[]) ?? []);
    });
  }, []);

  async function pickClient(id: string) {
    if (!supabase) return;
    const { data } = await supabase.rpc("client_detail", { p_id: id });
    const c = (data as ClientDetail | null)?.client;
    if (!c) return;
    setClient(c);
    setResults([]);
    setSearch("");
    setVisit((v) => ({
      ...v,
      address_line1: c.address_line1 ?? "",
      address_line2: c.address_line2 ?? "",
      city: c.city ?? "",
      postal_code: c.postal_code ?? "",
    }));
    if (c.area_id) setAreaId(c.area_id);
    if (c.contact_name) setContact({ name: c.contact_name, phone: c.contact_phone ?? "", email: c.contact_email ?? "", relationship: c.contact_relationship ?? "" });
  }

  useEffect(() => {
    if (!preselect) return;
    const t = setTimeout(() => void pickClient(preselect), 0);
    return () => clearTimeout(t);
     
  }, [preselect]);

  // Client search, lightly debounced.
  useEffect(() => {
    if (!supabase || clientMode !== "existing" || search.trim().length < 2) return;
    const t = setTimeout(async () => {
      const { data } = await supabase!.rpc("search_clients", { p_query: search.trim() });
      setResults(((data as ClientRow[]) ?? []).slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [search, clientMode]);

  const items = useMemo(
    () => Object.entries(qty).filter(([, n]) => n > 0).map(([id, quantity]) => ({ id, quantity })),
    [qty],
  );

  // Live price from the server, the same function online bookings use.
  useEffect(() => {
    if (!supabase || items.length === 0) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase!.rpc("quote_booking", { p_items: items, p_area_id: areaId || null, p_online: false });
      if (alive) setQuote(e ? null : (data as Quote));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [items, areaId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    if (clientMode === "existing" && !client) return setError("Find and choose the client, or switch to New client.");
    if (items.length === 0) return setError("Add at least one service or product.");
    if (scheduleNow && !nurseId) return setError("Choose a nurse, or untick Schedule now.");
    setBusy(true);
    const payload = {
      ...(clientMode === "existing" ? { client_id: client!.id } : { client: newClient }),
      items,
      area_id: areaId || null,
      visit,
      preferred_date: date,
      preferred_window: win,
      concerns,
      client_notes: clientNotes,
      insurance,
      staff_notes: staffNotes,
      booking_contact: contact.name ? contact : null,
      ...(scheduleNow
        ? { nurse_id: nurseId, scheduled_start: calgaryToISO(date, time), status: confirmNow ? "confirmed" : "assigned" }
        : { status: "new" }),
    };
    const { data, error: rpcError } = await supabase.rpc("admin_create_booking", { p: payload });
    setBusy(false);
    if (rpcError) return setError(await errorMessage(rpcError, "Couldn't create the booking."));
    router.push(`/admin/booking/?id=${(data as { booking_id: string }).booking_id}`);
  }

  const services = catalog.filter((c) => c.kind === "service");
  const others = catalog.filter((c) => c.kind !== "service");

  return (
    <form onSubmit={submit}>
      <PageHeader title="New booking">For phone calls, residences and walk-ins. Prices come from Services and prices.</PageHeader>
      {error && (
        <div className="mt-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel
            title="Client"
            actions={
              <div className="flex gap-1 rounded-lg border border-dune-deep bg-sand p-0.5">
                {(["existing", "new"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setClientMode(m)}
                    className={`rounded-md px-2.5 py-1 text-[0.9rem] font-semibold ${clientMode === m ? "bg-palm text-shell" : "text-ink"}`}
                  >
                    {m === "existing" ? "Existing client" : "New client"}
                  </button>
                ))}
              </div>
            }
          >
            {clientMode === "existing" ? (
              client ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>
                    <span className="block text-[1.1rem] font-bold">
                      {client.first_name} {client.last_name}
                    </span>
                    <span className="text-drift">{[client.phone, client.city].filter(Boolean).join(", ")}</span>
                  </p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setClient(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div>
                  <Field label="Find a client" hint="Name, phone or email.">
                    {(id) => <input id={id} className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />}
                  </Field>
                  {search.trim().length >= 2 && results.length > 0 && (
                    <ul className="mt-2 divide-y divide-dune rounded-lg border border-dune">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => void pickClient(r.id)} className="block w-full px-3 py-2 text-left hover:bg-sand">
                            <span className="font-semibold">
                              {r.first_name} {r.last_name}
                            </span>
                            <span className="ml-2 text-drift">{[r.phone, r.city].filter(Boolean).join(", ")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {search.trim().length >= 2 && results.length === 0 && <p className="mt-2 text-drift">No match. Switch to New client to add them.</p>}
                </div>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">{(id) => <input id={id} className={inputClass} value={newClient.first_name} onChange={(e) => setNewClient({ ...newClient, first_name: e.target.value })} />}</Field>
                <Field label="Last name">{(id) => <input id={id} className={inputClass} value={newClient.last_name} onChange={(e) => setNewClient({ ...newClient, last_name: e.target.value })} />}</Field>
                <Field label="Phone">{(id) => <input id={id} type="tel" className={inputClass} value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />}</Field>
                <Field label="Email (optional)">{(id) => <input id={id} type="email" className={inputClass} value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />}</Field>
                <Field label="Care notes (optional)" hint="Health details the nurse should always know." className="sm:col-span-2">
                  {(id) => <textarea id={id} rows={2} className={textareaClass} value={newClient.care_notes} onChange={(e) => setNewClient({ ...newClient, care_notes: e.target.value })} />}
                </Field>
              </div>
            )}
          </Panel>

          <Panel title="Services and products">
            <div className="grid gap-2 sm:grid-cols-2">
              {[...services, ...others].map((item) => (
                <label key={item.id} className={`flex items-center gap-3 rounded-lg border p-3 ${qty[item.id] ? "border-palm bg-leaf/60" : "border-dune"}`}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-palm"
                    checked={!!qty[item.id]}
                    onChange={(e) => setQty({ ...qty, [item.id]: e.target.checked ? 1 : 0 })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.name}</span>
                    <span className="text-[0.9rem] text-drift">
                      {money(item.price_cents)}
                      {item.taxable ? " + GST" : ""}
                      {item.kind !== "service" ? `, ${item.kind}` : ""}
                    </span>
                  </span>
                  {item.kind === "product" && qty[item.id] > 0 && (
                    <input
                      aria-label={`Quantity of ${item.name}`}
                      type="number"
                      min={1}
                      max={20}
                      className={`${inputClass} h-9 w-16`}
                      value={qty[item.id]}
                      onChange={(e) => setQty({ ...qty, [item.id]: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  )}
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Where and when">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Area">
                {(id) => (
                  <select id={id} className={inputClass} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                    <option value="">No area</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.surcharge_cents ? ` (+${money(a.surcharge_cents)})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Location">
                {(id) => (
                  <select id={id} className={inputClass} value={visit.location_type} onChange={(e) => setVisit({ ...visit, location_type: e.target.value })}>
                    <option value="home">Home</option>
                    <option value="residence">Seniors&apos; residence or care home</option>
                    <option value="other">Other</option>
                  </select>
                )}
              </Field>
              {visit.location_type === "residence" && (
                <Field label="Residence name" className="sm:col-span-2">
                  {(id) => <input id={id} className={inputClass} value={visit.residence_name} onChange={(e) => setVisit({ ...visit, residence_name: e.target.value })} />}
                </Field>
              )}
              <Field label="Street address">{(id) => <input id={id} className={inputClass} value={visit.address_line1} onChange={(e) => setVisit({ ...visit, address_line1: e.target.value })} />}</Field>
              <Field label="Unit, suite or room">{(id) => <input id={id} className={inputClass} value={visit.address_line2} onChange={(e) => setVisit({ ...visit, address_line2: e.target.value })} />}</Field>
              <Field label="City">{(id) => <input id={id} className={inputClass} value={visit.city} onChange={(e) => setVisit({ ...visit, city: e.target.value })} />}</Field>
              <Field label="Postal code">{(id) => <input id={id} className={inputClass} value={visit.postal_code} onChange={(e) => setVisit({ ...visit, postal_code: e.target.value })} />}</Field>
              <Field label="Date">{(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
              <Field label="Time of day">
                {(id) => (
                  <select id={id} className={inputClass} value={win} onChange={(e) => setWin(e.target.value as VisitWindow)}>
                    {WINDOWS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div className="mt-4 space-y-3 border-t border-dune pt-4">
              <Check label="Schedule a nurse now" checked={scheduleNow} onChange={setScheduleNow} hint="Otherwise it goes to the dispatch queue." />
              {scheduleNow && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Nurse">
                    {(id) => (
                      <select id={id} className={inputClass} value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
                        <option value="">Choose</option>
                        {nurses.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.full_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label="Time">{(id) => <input id={id} type="time" step={900} className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
                  <div className="flex items-end pb-2">
                    <Check label="Client has confirmed" checked={confirmNow} onChange={setConfirmNow} />
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Health information and notes">
            <fieldset>
              <legend className="text-[0.95rem] font-semibold">Help with</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {CONCERNS.map((c) => (
                  <Check
                    key={c.value}
                    label={c.label}
                    checked={concerns.includes(c.value)}
                    onChange={(v) => setConcerns(v ? [...concerns, c.value] : concerns.filter((x) => x !== c.value))}
                  />
                ))}
              </div>
            </fieldset>
            <div className="mt-4 grid gap-3">
              <Field label="Note from the client">{(id) => <textarea id={id} rows={2} className={textareaClass} value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} />}</Field>
              <Field label="Office notes">{(id) => <textarea id={id} rows={2} className={textareaClass} value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} />}</Field>
              <Field label="Insurance">
                {(id) => (
                  <select id={id} className={inputClass} value={insurance} onChange={(e) => setInsurance(e.target.value as Insurance)}>
                    {INSURANCE.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.value === "none" ? "None" : i.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </Panel>

          <Panel title="Booked by someone else? (optional)">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">{(id) => <input id={id} className={inputClass} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />}</Field>
              <Field label="Relationship">{(id) => <input id={id} className={inputClass} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} />}</Field>
              <Field label="Phone">{(id) => <input id={id} type="tel" className={inputClass} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />}</Field>
              <Field label="Email">{(id) => <input id={id} type="email" className={inputClass} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />}</Field>
            </div>
          </Panel>
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <Panel title="Total">
            {!quote || items.length === 0 ? (
              <p className="text-drift">Add a service to see the price.</p>
            ) : (
              <ul className="space-y-1.5">
                {quote.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3">
                    <span>
                      {i.name}
                      {i.quantity > 1 ? ` x ${i.quantity}` : ""}
                    </span>
                    <span>{money(i.unit_price_cents * i.quantity)}</span>
                  </li>
                ))}
                {quote.tax_cents > 0 && (
                  <li className="flex justify-between gap-3">
                    <span>GST</span>
                    <span>{money(quote.tax_cents)}</span>
                  </li>
                )}
                <li className="flex justify-between gap-3 border-t border-dune pt-2 text-[1.15rem] font-bold">
                  <span>Total</span>
                  <span>{money(quote.total_cents)}</span>
                </li>
              </ul>
            )}
            <p className="mt-3 text-[0.9rem] text-drift">Record the payment on the booking once it&apos;s received.</p>
            <Button type="submit" className="mt-4 w-full" disabled={busy}>
              {busy ? "Creating…" : "Create booking"}
            </Button>
          </Panel>
        </aside>
      </div>
    </form>
  );
}
