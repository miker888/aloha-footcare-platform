"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "@/lib/supabase";
import { dateTime, money, shortDate } from "@/lib/format";
import type { Client, ClientDetail, ServiceArea } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { Button, ButtonLink, Empty, Field, inputClass, Loading, Notice, PageHeader, Panel, PaymentPill, StatusPill, textareaClass } from "@/components/admin/ui";

export default function ClientPage() {
  return (
    <AdminOnly>
      <Suspense fallback={<Loading />}>
        <ClientScreen />
      </Suspense>
    </AdminOnly>
  );
}

const EDITABLE = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "postal_code",
  "area_id",
  "contact_name",
  "contact_relationship",
  "contact_phone",
  "contact_email",
  "care_notes",
  "staff_notes",
] as const;
type Editable = Pick<Client, (typeof EDITABLE)[number]>;

function ClientScreen() {
  const id = useSearchParams().get("id") ?? "";
  const [detail, setDetail] = useState<ClientDetail | null | undefined>(undefined);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [form, setForm] = useState<Editable | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    const [d, a] = await Promise.all([
      supabase.rpc("client_detail", { p_id: id }),
      supabase.from("service_areas").select("*").order("sort_order"),
    ]);
    const cd = (d.data as ClientDetail | null) ?? null;
    setDetail(cd);
    setAreas((a.data as ServiceArea[]) ?? []);
    if (cd) {
      const f = {} as Record<string, unknown>;
      EDITABLE.forEach((k) => (f[k] = cd.client[k] ?? ""));
      setForm(f as Editable);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!id) return <Notice tone="error">No client selected.</Notice>;
  if (detail === undefined || (detail && !form)) return <Loading />;
  if (detail === null || !form) return <Notice tone="error">This client doesn&apos;t exist, or your account can&apos;t see it.</Notice>;

  const c = detail.client;
  const set = (k: keyof Editable, v: string) => setForm({ ...form, [k]: v });

  async function save() {
    if (!supabase || !form) return;
    setBusy(true);
    const patch: Record<string, string | null> = {};
    EDITABLE.forEach((k) => {
      const v = String(form[k] ?? "").trim();
      patch[k] = v === "" ? null : v;
    });
    if (!patch.first_name || !patch.last_name) {
      setBusy(false);
      setFlash({ tone: "error", text: "First and last name are required." });
      return;
    }
    const { error } = await supabase.from("clients").update(patch).eq("id", c.id);
    setBusy(false);
    if (error) setFlash({ tone: "error", text: await errorMessage(error, "Couldn't save the client.") });
    else {
      setFlash({ tone: "success", text: "Client saved." });
      await load();
    }
  }

  const input = (k: keyof Editable, label: string, type = "text") => (
    <Field label={label}>
      {(fid) => <input id={fid} type={type} className={inputClass} value={String(form[k] ?? "")} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );

  return (
    <div>
      <Link href="/admin/clients/" className="font-semibold text-palm underline-offset-4 hover:underline">
        Clients
      </Link>
      <div className="mt-3">
        <PageHeader title={`${c.first_name} ${c.last_name}`} actions={<ButtonLink href={`/admin/new-booking/?client=${c.id}`}>New booking</ButtonLink>}>
          Client since {shortDate(c.created_at.slice(0, 10))}, added {c.source === "online" ? "online" : c.source === "import" ? "by import" : "by staff"}
        </PageHeader>
      </div>
      {flash && (
        <div className="mt-5">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Details">
          <div className="grid gap-3 sm:grid-cols-2">
            {input("first_name", "First name")}
            {input("last_name", "Last name")}
            {input("phone", "Phone", "tel")}
            {input("email", "Email", "email")}
            {input("address_line1", "Street address")}
            {input("address_line2", "Unit, suite or room")}
            {input("city", "City")}
            {input("postal_code", "Postal code")}
            <Field label="Area">
              {(fid) => (
                <select id={fid} className={inputClass} value={String(form.area_id ?? "")} onChange={(e) => set("area_id", e.target.value)}>
                  <option value="">Not set</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <h3 className="mt-6 font-sans text-[1rem] font-bold">Family or caregiver contact</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {input("contact_name", "Name")}
            {input("contact_relationship", "Relationship")}
            {input("contact_phone", "Phone", "tel")}
            {input("contact_email", "Email", "email")}
          </div>
          <div className="mt-6 grid gap-3">
            <Field label="Care notes" hint="Health information the nurse should always know.">
              {(fid) => <textarea id={fid} rows={3} className={textareaClass} value={String(form.care_notes ?? "")} onChange={(e) => set("care_notes", e.target.value)} />}
            </Field>
            <Field label="Office notes">
              {(fid) => <textarea id={fid} rows={2} className={textareaClass} value={String(form.staff_notes ?? "")} onChange={(e) => set("staff_notes", e.target.value)} />}
            </Field>
          </div>
          <Button className="mt-4" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save client"}
          </Button>
        </Panel>

        <Panel title="Visits">
          {detail.bookings.length === 0 ? (
            <Empty>No visits yet.</Empty>
          ) : (
            <ul className="divide-y divide-dune">
              {detail.bookings.map((b) => (
                <li key={b.id} className="py-3">
                  <Link href={`/admin/booking/?id=${b.id}`} className="font-semibold text-palm underline-offset-4 hover:underline">
                    {b.scheduled_start ? dateTime(b.scheduled_start) : `Asked for ${shortDate(b.preferred_date)}`}
                  </Link>
                  <p className="text-drift">
                    {b.reference}, {b.services.join(", ")}
                    {b.nurse_name ? `, ${b.nurse_name}` : ""}, {money(b.total_cents)}
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <StatusPill status={b.status} />
                    <PaymentPill status={b.payment_status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
