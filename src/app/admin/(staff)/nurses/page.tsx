"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "@/lib/supabase";
import type { Nurse, Profile, ServiceArea } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { Button, Check, Empty, Field, inputClass, Loading, Notice, PageHeader, Panel, Pill, textareaClass } from "@/components/admin/ui";

export default function NursesPage() {
  return (
    <AdminOnly>
      <Nurses />
    </AdminOnly>
  );
}

type Draft = {
  id?: string;
  full_name: string;
  designation: Nurse["designation"];
  phone: string;
  email: string;
  active: boolean;
  notes: string;
  profile_id: string;
  area_ids: string[];
};

const blank: Draft = { full_name: "", designation: "LPN", phone: "", email: "", active: true, notes: "", profile_id: "", area_ids: [] };

function Nurses() {
  const [nurses, setNurses] = useState<Nurse[] | null>(null);
  const [links, setLinks] = useState<{ nurse_id: string; area_id: string }[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [logins, setLogins] = useState<Profile[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [n, l, a, p] = await Promise.all([
      supabase.from("nurses").select("*").order("active", { ascending: false }).order("full_name"),
      supabase.from("nurse_areas").select("nurse_id, area_id"),
      supabase.from("service_areas").select("*").order("sort_order"),
      supabase.from("profiles").select("*").eq("role", "nurse").order("email"),
    ]);
    setNurses((n.data as Nurse[]) ?? []);
    setLinks((l.data as { nurse_id: string; area_id: string }[]) ?? []);
    setAreas((a.data as ServiceArea[]) ?? []);
    setLogins((p.data as Profile[]) ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? "";

  function edit(n: Nurse) {
    setFlash(null);
    setDraft({
      id: n.id,
      full_name: n.full_name,
      designation: n.designation,
      phone: n.phone ?? "",
      email: n.email ?? "",
      active: n.active,
      notes: n.notes ?? "",
      profile_id: n.profile_id ?? "",
      area_ids: links.filter((l) => l.nurse_id === n.id).map((l) => l.area_id),
    });
  }

  async function save() {
    if (!supabase || !draft) return;
    if (!draft.full_name.trim()) return setFlash({ tone: "error", text: "Enter the nurse's name." });
    setBusy(true);
    const { error } = await supabase.rpc("save_nurse", { p: draft });
    setBusy(false);
    if (error) return setFlash({ tone: "error", text: await errorMessage(error, "Couldn't save the nurse.") });
    setDraft(null);
    setFlash({ tone: "success", text: `${draft.full_name.trim()} saved.` });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Nurses"
        actions={
          <Button
            onClick={() => {
              setFlash(null);
              setDraft({ ...blank });
            }}
          >
            Add a nurse
          </Button>
        }
      >
        Areas decide who&apos;s suggested first on the dispatch screen.
      </PageHeader>

      {flash && (
        <div className="mt-5">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          {!nurses ? (
            <Loading />
          ) : nurses.length === 0 ? (
            <Empty>No nurses yet. Add your first one.</Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {nurses.map((n) => {
                const nurseAreas = links.filter((l) => l.nurse_id === n.id).map((l) => areaName(l.area_id));
                return (
                  <li key={n.id} className={`rounded-xl border bg-shell p-4 ${draft?.id === n.id ? "border-palm" : "border-dune"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[1.1rem] font-bold">
                          {n.full_name}, {n.designation}
                        </p>
                        <p className="text-drift">{[n.phone, n.email].filter(Boolean).join(", ") || "No contact details"}</p>
                      </div>
                      {!n.active && <Pill tone="drift">Inactive</Pill>}
                    </div>
                    <p className="mt-2 text-[0.95rem]">{nurseAreas.length ? nurseAreas.join(", ") : <span className="text-drift">No areas yet</span>}</p>
                    <p className="mt-1 text-[0.9rem] text-drift">{n.profile_id ? "Can sign in to see their visits" : "No login linked"}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={() => edit(n)}>
                      Edit
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {draft && (
          <Panel title={draft.id ? `Edit ${draft.full_name}` : "Add a nurse"} className="xl:sticky xl:top-8 xl:self-start">
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label="Full name">{(id) => <input id={id} className={inputClass} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />}</Field>
                <Field label="Designation">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value as Draft["designation"] })}>
                      <option>LPN</option>
                      <option>RN</option>
                      <option>HCA</option>
                      <option>Other</option>
                    </select>
                  )}
                </Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Phone">{(id) => <input id={id} type="tel" className={inputClass} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />}</Field>
                <Field label="Email">{(id) => <input id={id} type="email" className={inputClass} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}</Field>
              </div>
              <fieldset>
                <legend className="text-[0.95rem] font-semibold">Areas they cover</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {areas.map((a) => (
                    <Check
                      key={a.id}
                      label={a.name}
                      checked={draft.area_ids.includes(a.id)}
                      onChange={(v) => setDraft({ ...draft, area_ids: v ? [...draft.area_ids, a.id] : draft.area_ids.filter((x) => x !== a.id) })}
                    />
                  ))}
                </div>
              </fieldset>
              <Field label="Login" hint="Staff accounts with the Nurse role. Linking lets them see their own visits.">
                {(id) => (
                  <select id={id} className={inputClass} value={draft.profile_id} onChange={(e) => setDraft({ ...draft, profile_id: e.target.value })}>
                    <option value="">No login</option>
                    {logins.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ? `${p.full_name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Notes">{(id) => <textarea id={id} rows={2} className={textareaClass} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />}</Field>
              <Check label="Active" hint="Inactive nurses aren't offered on the dispatch screen." checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
              <div className="flex gap-2 pt-1">
                <Button disabled={busy} onClick={() => void save()}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Button variant="quiet" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
