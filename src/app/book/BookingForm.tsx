"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { errorMessage, FUNCTION_REGION, supabase } from "@/lib/supabase";
import { addDays, longDate, money, todayISO } from "@/lib/format";
import { CONCERNS, INSURANCE, WINDOWS, concernLabel, insuranceLabel, windowLabel } from "@/lib/labels";
import { site } from "@/lib/site";
import type { CatalogItem, Insurance, Quote, ServiceArea, Settings, VisitWindow } from "@/lib/types";

type Form = {
  serviceId: string;
  areaId: string;
  locationType: "home" | "residence";
  residenceName: string;
  address1: string;
  address2: string;
  city: string;
  postal: string;
  preferredDate: string;
  alternateDate: string;
  window: VisitWindow;
  bookingFor: "self" | "other";
  contactFirst: string;
  contactLast: string;
  contactPhone: string;
  contactEmail: string;
  patientFirst: string;
  patientLast: string;
  patientPhone: string;
  relationship: string;
  concerns: string[];
  notes: string;
  insurance: Insurance;
  consent: boolean;
  website: string; // honeypot
};

const EMPTY: Form = {
  serviceId: "",
  areaId: "",
  locationType: "home",
  residenceName: "",
  address1: "",
  address2: "",
  city: "",
  postal: "",
  preferredDate: "",
  alternateDate: "",
  window: "any",
  bookingFor: "self",
  contactFirst: "",
  contactLast: "",
  contactPhone: "",
  contactEmail: "",
  patientFirst: "",
  patientLast: "",
  patientPhone: "",
  relationship: "",
  concerns: [],
  notes: "",
  insurance: "none",
  consent: false,
  website: "",
};

const STEPS = ["Service", "Where and when", "About you", "Review and pay"] as const;

const digits = (s: string) => s.replace(/\D/g, "");
const validPhone = (s: string) => {
  const d = digits(s);
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
};
const validEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
const validPostal = (s: string) => /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(s.trim());

type Loaded = { settings: Settings; areas: ServiceArea[]; services: CatalogItem[] };

export function BookingForm() {
  const params = useSearchParams();
  const unpaidRef = params.get("unpaid");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(supabase ? null : "not-connected");
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [s, a, c] = await Promise.all([
        supabase.from("settings").select("*").single(),
        supabase.from("service_areas").select("*").eq("active", true).order("sort_order").order("name"),
        supabase
          .from("catalog_items")
          .select("*")
          .eq("kind", "service")
          .eq("bookable_online", true)
          .eq("active", true)
          .order("sort_order"),
      ]);
      if (!alive) return;
      if (s.error || a.error || c.error || !s.data) {
        setLoadError("failed");
        return;
      }
      setLoaded({ settings: s.data as Settings, areas: a.data as ServiceArea[], services: c.data as CatalogItem[] });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Move focus to the step heading when the step changes.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const service = loaded?.services.find((s) => s.id === form.serviceId) ?? null;
  const area = loaded?.areas.find((a) => a.id === form.areaId) ?? null;
  const minDate = loaded ? addDays(todayISO(), loaded.settings.min_lead_days) : "";
  const maxDate = loaded ? addDays(todayISO(), loaded.settings.max_days_ahead) : "";

  const estimate = useMemo(() => {
    if (!service) return null;
    const surcharge = area?.surcharge_cents ?? 0;
    const tax = service.taxable ? Math.round((service.price_cents * (loaded?.settings.gst_rate_bps ?? 0)) / 10000) : 0;
    return { service: service.price_cents, surcharge, tax, total: service.price_cents + surcharge + tax };
  }, [service, area, loaded]);

  if (loadError === "not-connected") {
    return (
      <Notice title="Online booking is coming soon">
        For now, call us at{" "}
        <a href={site.phone.href} className="font-semibold text-clay underline underline-offset-4">
          {site.phone.display}
        </a>{" "}
        and we&apos;ll book your visit over the phone.
      </Notice>
    );
  }
  if (loadError) {
    return (
      <Notice title="The booking form didn't load">
        Refresh the page to try again, or call us at{" "}
        <a href={site.phone.href} className="font-semibold text-clay underline underline-offset-4">
          {site.phone.display}
        </a>
        .
      </Notice>
    );
  }
  if (!loaded) return <p className="mt-10 text-drift">Loading the booking form…</p>;
  if (!loaded.settings.online_booking_enabled) {
    return (
      <Notice title="Online booking is paused">
        {loaded.settings.booking_notice ?? "We're not taking online bookings right now."} Call us at{" "}
        <a href={site.phone.href} className="font-semibold text-clay underline underline-offset-4">
          {site.phone.display}
        </a>{" "}
        to book.
      </Notice>
    );
  }

  function validate(s: number): string | null {
    if (s === 0) {
      if (!form.serviceId) return "Choose a service.";
      if (!form.areaId) return "Choose the area where the visit will be.";
    }
    if (s === 1) {
      if (form.locationType === "residence" && !form.residenceName.trim()) return "Enter the name of the residence.";
      if (!form.address1.trim()) return "Enter the street address for the visit.";
      if (!form.city.trim()) return "Enter the city or town.";
      if (!validPostal(form.postal)) return "Enter the postal code, like T2P 0L4.";
      if (!form.preferredDate) return "Choose a date for the visit.";
      if (form.preferredDate < minDate || form.preferredDate > maxDate)
        return `Choose a date between ${longDate(minDate)} and ${longDate(maxDate)}.`;
      if (form.alternateDate && (form.alternateDate < minDate || form.alternateDate > maxDate))
        return `Choose a backup date between ${longDate(minDate)} and ${longDate(maxDate)}, or leave it blank.`;
    }
    if (s === 2) {
      if (form.bookingFor === "other" && (!form.patientFirst.trim() || !form.patientLast.trim()))
        return "Enter the first and last name of the person receiving care.";
      if (form.bookingFor === "other" && form.patientPhone.trim() && !validPhone(form.patientPhone))
        return "Enter a 10-digit phone number for the person receiving care, or leave it blank.";
      if (!form.contactFirst.trim() || !form.contactLast.trim()) return "Enter your first and last name.";
      if (!validPhone(form.contactPhone)) return "Enter a 10-digit phone number we can reach you at.";
      if (!validEmail(form.contactEmail)) return "Enter a valid email address.";
    }
    if (s === 3) {
      if (!form.consent) return "Please confirm you've read how we use your information.";
    }
    return null;
  }

  async function next() {
    const problem = validate(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (step === 2) {
      // Price check with the server before the review step.
      const { data, error: qErr } = await supabase!.rpc("quote_booking", {
        p_items: [{ id: form.serviceId, quantity: 1 }],
        p_area_id: form.areaId,
        p_online: true,
      });
      if (qErr) {
        setError(await errorMessage(qErr, "We couldn't check the price. Refresh the page and try again."));
        return;
      }
      setQuote(data as Quote);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const problem = validate(3);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    const body = {
      booking_for: form.bookingFor,
      contact: {
        first_name: form.contactFirst,
        last_name: form.contactLast,
        phone: form.contactPhone,
        email: form.contactEmail,
      },
      patient:
        form.bookingFor === "other"
          ? { first_name: form.patientFirst, last_name: form.patientLast, phone: form.patientPhone }
          : null,
      relationship: form.bookingFor === "other" ? form.relationship : null,
      items: [{ id: form.serviceId, quantity: 1 }],
      area_id: form.areaId,
      visit: {
        location_type: form.locationType,
        residence_name: form.locationType === "residence" ? form.residenceName : null,
        address_line1: form.address1,
        address_line2: form.address2,
        city: form.city,
        postal_code: form.postal,
      },
      preferred_date: form.preferredDate,
      alternate_date: form.alternateDate || null,
      preferred_window: form.window,
      concerns: form.concerns,
      client_notes: form.notes,
      insurance: form.insurance,
      consent: form.consent,
      website: form.website,
    };
    const { data, error: fnError } = await supabase!.functions.invoke("create-booking", {
      body,
      region: FUNCTION_REGION,
    });
    if (fnError || !data?.url) {
      setSubmitting(false);
      setError(await errorMessage(fnError, "We couldn't send your request. Try again, or call us to book."));
      return;
    }
    window.location.assign(data.url as string);
  }

  const total = quote?.total_cents ?? estimate?.total ?? 0;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        {unpaidRef && (
          <div className="mb-8 rounded-2xl border-2 border-clay/40 bg-blush px-5 py-4 text-ink" role="status">
            <p className="font-semibold">Your payment wasn&apos;t completed, so request {unpaidRef} isn&apos;t booked.</p>
            <p className="mt-1 text-drift">
              Fill in the form again to try once more, or call us at{" "}
              <a href={site.phone.href} className="font-semibold text-clay underline underline-offset-4">
                {site.phone.display}
              </a>
              .
            </p>
          </div>
        )}

        <Progress step={step} />

        <h2 ref={headingRef} tabIndex={-1} className="mt-8 text-[1.9rem] text-ink outline-none">
          {STEPS[step]}
        </h2>

        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="mt-4 rounded-xl border-2 border-alert/40 bg-blush px-5 py-3.5 font-semibold text-alert outline-none"
          >
            {error}
          </div>
        )}

        <form
          className="mt-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 3) void next();
            else void submit();
          }}
        >
          {/* Honeypot: hidden from people and screen readers. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
            </label>
          </div>

          {step === 0 && (
            <div className="space-y-10">
              <fieldset>
                <legend className="text-[1.2rem] font-semibold text-ink">Which service would you like?</legend>
                <div className="mt-4 grid gap-3">
                  {loaded.services.map((s) => (
                    <RadioCard
                      key={s.id}
                      name="service"
                      checked={form.serviceId === s.id}
                      onChange={() => set("serviceId", s.id)}
                      title={s.name}
                      meta={`${money(s.price_cents)}${s.duration_min ? `, about ${s.duration_min} minutes` : ""}`}
                      text={s.description}
                    />
                  ))}
                </div>
              </fieldset>

              <Field label="Where will the visit be?" hint="Choose the closest area. A travel charge applies outside Calgary.">
                {(id) => (
                  <select
                    id={id}
                    className={inputClass}
                    value={form.areaId}
                    onChange={(e) => {
                      const a = loaded.areas.find((x) => x.id === e.target.value);
                      setForm((f) => ({
                        ...f,
                        areaId: e.target.value,
                        city: f.city || (a ? (a.name.startsWith("Calgary") ? "Calgary" : a.name) : ""),
                      }));
                    }}
                  >
                    <option value="">Choose an area</option>
                    {loaded.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.surcharge_cents > 0 ? ` (travel charge ${money(a.surcharge_cents)})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <p className="-mt-6 text-[1rem] text-drift">
                Somewhere not on the list? Call us at{" "}
                <a href={site.phone.href} className="text-clay underline underline-offset-4">
                  {site.phone.display}
                </a>
                .
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-8">
              <fieldset>
                <legend className="text-[1.2rem] font-semibold text-ink">Where will the nurse visit?</legend>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <RadioCard name="loc" checked={form.locationType === "home"} onChange={() => set("locationType", "home")} title="A home" />
                  <RadioCard
                    name="loc"
                    checked={form.locationType === "residence"}
                    onChange={() => set("locationType", "residence")}
                    title="A seniors' residence or care home"
                  />
                </div>
              </fieldset>

              {form.locationType === "residence" && (
                <Field label="Name of the residence">
                  {(id) => <input id={id} className={inputClass} value={form.residenceName} onChange={(e) => set("residenceName", e.target.value)} />}
                </Field>
              )}

              <Field label="Street address">
                {(id) => (
                  <input id={id} className={inputClass} autoComplete="address-line1" value={form.address1} onChange={(e) => set("address1", e.target.value)} />
                )}
              </Field>
              <Field label="Unit, suite or room" optional>
                {(id) => (
                  <input id={id} className={inputClass} autoComplete="address-line2" value={form.address2} onChange={(e) => set("address2", e.target.value)} />
                )}
              </Field>
              <div className="grid gap-8 sm:grid-cols-2">
                <Field label="City or town">
                  {(id) => (
                    <input id={id} className={inputClass} autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  )}
                </Field>
                <Field label="Postal code">
                  {(id) => (
                    <input
                      id={id}
                      className={`${inputClass} uppercase`}
                      autoComplete="postal-code"
                      maxLength={7}
                      value={form.postal}
                      onChange={(e) => set("postal", e.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                <Field label="Preferred date">
                  {(id) => (
                    <input id={id} type="date" className={inputClass} min={minDate} max={maxDate} value={form.preferredDate} onChange={(e) => set("preferredDate", e.target.value)} />
                  )}
                </Field>
                <Field label="Backup date" optional>
                  {(id) => (
                    <input id={id} type="date" className={inputClass} min={minDate} max={maxDate} value={form.alternateDate} onChange={(e) => set("alternateDate", e.target.value)} />
                  )}
                </Field>
              </div>

              <fieldset>
                <legend className="text-[1.2rem] font-semibold text-ink">What time of day suits you?</legend>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {WINDOWS.map((w) => (
                    <RadioCard key={w.value} name="window" checked={form.window === w.value} onChange={() => set("window", w.value)} title={w.label} />
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <fieldset>
                <legend className="text-[1.2rem] font-semibold text-ink">Who is the visit for?</legend>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <RadioCard name="for" checked={form.bookingFor === "self"} onChange={() => set("bookingFor", "self")} title="Me" />
                  <RadioCard
                    name="for"
                    checked={form.bookingFor === "other"}
                    onChange={() => set("bookingFor", "other")}
                    title="Someone else"
                    text="A parent, relative or client you're booking for."
                  />
                </div>
              </fieldset>

              {form.bookingFor === "other" && (
                <fieldset className="space-y-6 rounded-2xl border border-dune bg-shell p-5 sm:p-6">
                  <legend className="px-1 text-[1.2rem] font-semibold text-ink">The person receiving care</legend>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="First name">
                      {(id) => <input id={id} className={inputClass} value={form.patientFirst} onChange={(e) => set("patientFirst", e.target.value)} />}
                    </Field>
                    <Field label="Last name">
                      {(id) => <input id={id} className={inputClass} value={form.patientLast} onChange={(e) => set("patientLast", e.target.value)} />}
                    </Field>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Their phone" optional>
                      {(id) => <input id={id} type="tel" className={inputClass} value={form.patientPhone} onChange={(e) => set("patientPhone", e.target.value)} />}
                    </Field>
                    <Field label="Your relationship to them" optional hint="For example, daughter or caregiver.">
                      {(id) => <input id={id} className={inputClass} value={form.relationship} onChange={(e) => set("relationship", e.target.value)} />}
                    </Field>
                  </div>
                </fieldset>
              )}

              <fieldset className="space-y-6">
                <legend className="text-[1.2rem] font-semibold text-ink">
                  {form.bookingFor === "self" ? "Your details" : "Your details, so we can reach you"}
                </legend>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="First name">
                    {(id) => <input id={id} className={inputClass} autoComplete="given-name" value={form.contactFirst} onChange={(e) => set("contactFirst", e.target.value)} />}
                  </Field>
                  <Field label="Last name">
                    {(id) => <input id={id} className={inputClass} autoComplete="family-name" value={form.contactLast} onChange={(e) => set("contactLast", e.target.value)} />}
                  </Field>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Phone" hint="We'll call to confirm the visit time.">
                    {(id) => <input id={id} type="tel" className={inputClass} autoComplete="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />}
                  </Field>
                  <Field label="Email" hint="Your receipt goes here.">
                    {(id) => <input id={id} type="email" className={inputClass} autoComplete="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />}
                  </Field>
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-[1.2rem] font-semibold text-ink">
                  What would you like help with? <span className="font-normal text-drift">(optional)</span>
                </legend>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {CONCERNS.map((c) => {
                    const checked = form.concerns.includes(c.value);
                    return (
                      <label
                        key={c.value}
                        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 ${checked ? "border-clay bg-shell" : "border-dune bg-shell/60 hover:border-dune-deep"}`}
                      >
                        <input
                          type="checkbox"
                          className="h-6 w-6 shrink-0 accent-clay"
                          checked={checked}
                          onChange={(e) =>
                            set("concerns", e.target.checked ? [...form.concerns, c.value] : form.concerns.filter((x) => x !== c.value))
                          }
                        />
                        <span className="text-ink">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <Field label="Anything the nurse should know?" optional hint="For example, medications, mobility, or how to get in.">
                {(id) => (
                  <textarea id={id} rows={4} maxLength={1000} className={`${inputClass} h-auto py-3`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                )}
              </Field>

              <Field label="Do you have insurance coverage for foot care?">
                {(id) => (
                  <select id={id} className={inputClass} value={form.insurance} onChange={(e) => set("insurance", e.target.value as Insurance)}>
                    {INSURANCE.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8">
              <dl className="divide-y divide-dune rounded-2xl border border-dune bg-shell">
                <Row label="Service">{service?.name}</Row>
                <Row label="Visit">
                  {form.locationType === "residence" && <span className="block">{form.residenceName}</span>}
                  <span className="block">
                    {form.address1}
                    {form.address2 ? `, ${form.address2}` : ""}
                  </span>
                  <span className="block">
                    {form.city} {form.postal.toUpperCase()}
                  </span>
                </Row>
                <Row label="When">
                  <span className="block">
                    {longDate(form.preferredDate)}, {windowLabel(form.window).toLowerCase()}
                  </span>
                  {form.alternateDate && <span className="block text-drift">or {longDate(form.alternateDate)}</span>}
                </Row>
                <Row label="For">
                  {form.bookingFor === "self"
                    ? `${form.contactFirst} ${form.contactLast}`
                    : `${form.patientFirst} ${form.patientLast}`}
                </Row>
                <Row label="Contact">
                  <span className="block">
                    {form.contactFirst} {form.contactLast}
                  </span>
                  <span className="block">{form.contactPhone}</span>
                  <span className="block break-all">{form.contactEmail}</span>
                </Row>
                {form.concerns.length > 0 && <Row label="Help with">{form.concerns.map(concernLabel).join(", ")}</Row>}
                {form.insurance !== "none" && <Row label="Insurance">{insuranceLabel(form.insurance)}</Row>}
              </dl>

              {quote && (
                <div className="rounded-2xl border border-dune bg-shell p-5 sm:p-6">
                  <ul className="space-y-1.5">
                    {quote.items.map((i, idx) => (
                      <li key={idx} className="flex justify-between gap-4">
                        <span>{i.name}</span>
                        <span>{money(i.unit_price_cents * i.quantity)}</span>
                      </li>
                    ))}
                    {quote.tax_cents > 0 && (
                      <li className="flex justify-between gap-4">
                        <span>GST</span>
                        <span>{money(quote.tax_cents)}</span>
                      </li>
                    )}
                  </ul>
                  <p className="mt-4 flex justify-between gap-4 border-t border-dune pt-4 text-[1.3rem] font-semibold">
                    <span>Total</span>
                    <span>{money(quote.total_cents)}</span>
                  </p>
                </div>
              )}

              <p className="text-drift">
                After payment we&apos;ll contact you to confirm your nurse and visit time. If the time you asked for
                doesn&apos;t work, we&apos;ll offer another.
              </p>

              <label className="flex cursor-pointer gap-4 rounded-2xl border-2 border-dune bg-shell p-5">
                <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-clay" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
                <span>
                  I&apos;ve read{" "}
                  <Link href="/privacy/" target="_blank" className="text-clay underline underline-offset-4">
                    how Aloha Footcare collects and uses health information
                  </Link>{" "}
                  and agree to share these details to arrange my visit.
                </span>
              </label>
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {step < 3 ? (
              <button type="submit" className={primaryButton}>
                Continue
              </button>
            ) : (
              <button type="submit" disabled={submitting} className={`${primaryButton} disabled:opacity-60`}>
                {submitting ? "Opening secure payment…" : `Pay ${money(total)} and send request`}
              </button>
            )}
            {step > 0 && (
              <button type="button" onClick={back} className="h-14 rounded-full px-6 text-[1.1rem] font-semibold text-ink underline underline-offset-4 hover:text-clay">
                Back
              </button>
            )}
          </div>
          {step === 3 && (
            <p className="mt-4 text-[1rem] text-drift">Card payment is handled securely by Stripe. We never see your full card number.</p>
          )}
        </form>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Your visit so far">
        <div className="rounded-2xl border border-dune bg-shell p-6">
          <h2 className="text-[1.35rem] text-ink">Your visit</h2>
          {!service ? (
            <p className="mt-3 text-drift">Choose a service to see the price.</p>
          ) : (
            <dl className="mt-4 space-y-3 text-[1.05rem]">
              <div className="flex justify-between gap-4">
                <dt>{service.name}</dt>
                <dd>{money(service.price_cents)}</dd>
              </div>
              {estimate && estimate.surcharge > 0 && (
                <div className="flex justify-between gap-4">
                  <dt>Travel charge</dt>
                  <dd>{money(estimate.surcharge)}</dd>
                </div>
              )}
              {form.preferredDate && (
                <div>
                  <dt className="sr-only">Date</dt>
                  <dd className="text-drift">
                    {longDate(form.preferredDate)}, {windowLabel(form.window).toLowerCase()}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-dune pt-3 text-[1.2rem] font-semibold">
                <dt>Total</dt>
                <dd>{money(total)}</dd>
              </div>
            </dl>
          )}
          <p className="mt-5 border-t border-dune pt-4 text-[1rem] text-drift">
            Questions? Call{" "}
            <a href={site.phone.href} className="font-semibold text-clay underline underline-offset-4">
              {site.phone.display}
            </a>
          </p>
        </div>
      </aside>
    </div>
  );
}

const inputClass =
  "block h-14 w-full rounded-xl border-2 border-dune-deep bg-shell px-4 text-[1.15rem] text-ink placeholder:text-drift/70 focus:border-clay focus:outline-none";
const primaryButton =
  "inline-flex h-14 items-center rounded-full bg-clay px-8 text-[1.15rem] font-semibold text-shell hover:bg-clay-deep";

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[1.1rem] font-semibold text-ink">
        {label} {optional && <span className="font-normal text-drift">(optional)</span>}
      </label>
      {hint && <p className="mt-0.5 text-[1rem] text-drift">{hint}</p>}
      <div className="mt-2">{children(id)}</div>
    </div>
  );
}

function RadioCard({
  name,
  checked,
  onChange,
  title,
  meta,
  text,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  meta?: string;
  text?: string | null;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-4 rounded-2xl border-2 p-4 sm:p-5 ${checked ? "border-clay bg-shell" : "border-dune bg-shell/60 hover:border-dune-deep"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 h-6 w-6 shrink-0 accent-clay" />
      <span>
        <span className="block text-[1.15rem] font-semibold text-ink">{title}</span>
        {meta && <span className="block text-clay">{meta}</span>}
        {text && <span className="mt-1 block text-drift">{text}</span>}
      </span>
    </label>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div>
      <p className="font-semibold text-drift">
        Step {step + 1} of {STEPS.length}
      </p>
      <ol className="mt-3 grid grid-cols-4 gap-2" aria-label="Booking steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <span className={`block h-2 rounded-full ${i <= step ? "bg-clay" : "bg-dune"}`} />
            <span className={`mt-2 hidden text-[0.95rem] sm:block ${i === step ? "font-semibold text-ink" : "text-drift"}`}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="font-semibold text-drift">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 max-w-2xl rounded-2xl border border-dune bg-shell p-6 sm:p-8">
      <h2 className="text-[1.6rem] text-ink">{title}</h2>
      <p className="mt-3 text-drift">{children}</p>
    </div>
  );
}
