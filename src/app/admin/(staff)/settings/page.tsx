"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "@/lib/supabase";
import { centsToDollars, dollarsToCents, money } from "@/lib/format";
import type { Profile, ServiceArea, Settings } from "@/lib/types";
import { AdminOnly, useStaff } from "@/components/admin/AdminShell";
import { Button, Check, Field, inlineInputClass, inputClass, Loading, Notice, PageHeader, Panel, Pill, textareaClass } from "@/components/admin/ui";

export default function SettingsPage() {
  return (
    <AdminOnly>
      <SettingsScreen />
    </AdminOnly>
  );
}

type Flash = { tone: "success" | "error"; text: string } | null;

function SettingsScreen() {
  const [flash, setFlash] = useState<Flash>(null);
  return (
    <div>
      <PageHeader title="Settings">Online booking, the areas you cover, and who can sign in.</PageHeader>
      {flash && (
        <div className="mt-5">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <BookingSettings onFlash={setFlash} />
        <Areas onFlash={setFlash} />
        <Staff onFlash={setFlash} />
      </div>
    </div>
  );
}

function BookingSettings({ onFlash }: { onFlash: (f: Flash) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [gst, setGst] = useState("5");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("settings").select("*").single();
    if (data) {
      setS(data as Settings);
      setGst(String((data as Settings).gst_rate_bps / 100));
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!s) return <Panel title="Online booking"><Loading /></Panel>;

  async function save() {
    if (!supabase || !s) return;
    const bps = Math.round(Number(gst) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 2000) return onFlash({ tone: "error", text: "GST must be between 0 and 20 percent." });
    setBusy(true);
    const { error } = await supabase
      .from("settings")
      .update({
        online_booking_enabled: s.online_booking_enabled,
        min_lead_days: s.min_lead_days,
        max_days_ahead: s.max_days_ahead,
        booking_notice: s.booking_notice?.trim() || null,
        gst_rate_bps: bps,
        require_mfa: s.require_mfa,
      })
      .eq("id", true);
    setBusy(false);
    if (error) {
      onFlash({ tone: "error", text: await errorMessage(error, "Couldn't save the settings.") });
      await load();
      return;
    }
    onFlash({ tone: "success", text: "Settings saved." });
  }

  return (
    <Panel title="Online booking">
      <div className="space-y-4">
        <Check
          label="Take bookings on the website"
          hint="When off, the booking page asks people to call."
          checked={s.online_booking_enabled}
          onChange={(v) => setS({ ...s, online_booking_enabled: v })}
        />
        <div className="grid grid-cols-3 gap-2">
          <Field label="Earliest" hint="Days from today">
            {(id) => <input id={id} type="number" min={0} max={30} className={inputClass} value={s.min_lead_days} onChange={(e) => setS({ ...s, min_lead_days: Number(e.target.value) })} />}
          </Field>
          <Field label="Latest" hint="Days ahead">
            {(id) => <input id={id} type="number" min={1} max={365} className={inputClass} value={s.max_days_ahead} onChange={(e) => setS({ ...s, max_days_ahead: Number(e.target.value) })} />}
          </Field>
          <Field label="GST" hint="Percent">
            {(id) => <input id={id} inputMode="decimal" className={inputClass} value={gst} onChange={(e) => setGst(e.target.value)} />}
          </Field>
        </div>
        <Field label="Message when booking is paused">
          {(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={s.booking_notice ?? ""} onChange={(e) => setS({ ...s, booking_notice: e.target.value })} />}
        </Field>
        <div className="rounded-lg border border-dune bg-sand/60 p-3">
          <Check
            label="Require two-step sign-in for all staff"
            hint="Staff then need an authenticator app code to see any client information. Set it up on your own account first."
            checked={s.require_mfa}
            onChange={(v) => setS({ ...s, require_mfa: v })}
          />
        </div>
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </Panel>
  );
}

function Areas({ onFlash }: { onFlash: (f: Flash) => void }) {
  const [areas, setAreas] = useState<ServiceArea[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; surcharge: string; active: boolean; sort_order: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("service_areas").select("*").order("sort_order").order("name");
    setAreas((data as ServiceArea[]) ?? []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    if (!supabase || !editing) return;
    const cents = dollarsToCents(editing.surcharge || "0");
    if (!editing.name.trim()) return onFlash({ tone: "error", text: "Enter the area name." });
    if (cents === null) return onFlash({ tone: "error", text: "Enter the travel charge in dollars, like 20.00, or 0." });
    const row = { name: editing.name.trim(), surcharge_cents: cents, active: editing.active, sort_order: Number(editing.sort_order) || 0 };
    setBusy(true);
    const { error } = editing.id
      ? await supabase.from("service_areas").update(row).eq("id", editing.id)
      : await supabase.from("service_areas").insert(row);
    setBusy(false);
    if (error) return onFlash({ tone: "error", text: await errorMessage(error, "Couldn't save the area. Names must be unique.") });
    setEditing(null);
    onFlash({ tone: "success", text: `${row.name} saved.` });
    await load();
  }

  return (
    <Panel
      title="Areas and travel charges"
      actions={
        <Button size="sm" variant="secondary" onClick={() => setEditing({ name: "", surcharge: "0.00", active: true, sort_order: "100" })}>
          Add an area
        </Button>
      }
    >
      {!areas ? (
        <Loading />
      ) : (
        <ul className="divide-y divide-dune">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-semibold">{a.name}</span>
                <span className="ml-2 text-drift">{a.surcharge_cents ? `+${money(a.surcharge_cents)}` : "No travel charge"}</span>
                {!a.active && (
                  <span className="ml-2">
                    <Pill tone="drift">Hidden</Pill>
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setEditing({ id: a.id, name: a.name, surcharge: centsToDollars(a.surcharge_cents), active: a.active, sort_order: String(a.sort_order) })}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div className="mt-4 space-y-3 rounded-lg border border-dune bg-sand/60 p-3">
          <div className="grid grid-cols-[1fr_7rem_5rem] gap-2">
            <Field label="Name">{(id) => <input id={id} className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <Field label="Charge ($)">{(id) => <input id={id} inputMode="decimal" className={inputClass} value={editing.surcharge} onChange={(e) => setEditing({ ...editing, surcharge: e.target.value })} />}</Field>
            <Field label="Order">{(id) => <input id={id} type="number" className={inputClass} value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} />}</Field>
          </div>
          <Check label="Shown on the booking form" checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Staff({ onFlash }: { onFlash: (f: Flash) => void }) {
  const me = useStaff();
  const [people, setPeople] = useState<Profile[] | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("*").order("role").order("email");
    setPeople((data as Profile[]) ?? []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function update(p: Profile, patch: Partial<Profile>) {
    if (!supabase) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", p.id);
    if (error) onFlash({ tone: "error", text: await errorMessage(error, "Couldn't update that person.") });
    else onFlash({ tone: "success", text: `${p.email} updated.` });
    await load();
  }

  return (
    <Panel title="Staff accounts" className="xl:col-span-2">
      <p className="text-drift">
        To add someone, invite them by email from Supabase (Authentication, then Users, then Invite). They appear here
        with no access until you choose a role. Nurses also need linking to their nurse record under Nurses.
      </p>
      {!people ? (
        <Loading />
      ) : (
        <div className="-mx-4 mt-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[560px] text-left">
            <thead className="text-[0.9rem] text-drift">
              <tr>
                <th className="px-4 py-2 font-semibold sm:px-5">Person</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Can sign in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dune border-t border-dune">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 sm:px-5">
                    <span className="font-semibold">{p.full_name || p.email}</span>
                    {p.full_name && <span className="block text-[0.85rem] text-drift">{p.email}</span>}
                    {p.id === me.userId && <span className="block text-[0.85rem] text-drift">You</span>}
                  </td>
                  <td className="px-4 py-2">
                    <label className="sr-only" htmlFor={`role-${p.id}`}>
                      Role for {p.email}
                    </label>
                    <select id={`role-${p.id}`} className={inlineInputClass} value={p.role} onChange={(e) => void update(p, { role: e.target.value as Profile["role"] })}>
                      <option value="none">No access</option>
                      <option value="nurse">Nurse</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <Check label={p.active ? "Yes" : "No"} checked={p.active} onChange={(v) => void update(p, { active: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
