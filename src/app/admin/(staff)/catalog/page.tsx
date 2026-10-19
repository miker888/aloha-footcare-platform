"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "@/lib/supabase";
import { centsToDollars, dollarsToCents, money } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { Button, Check, Empty, Field, inputClass, Loading, Notice, PageHeader, Panel, Pill, textareaClass } from "@/components/admin/ui";

export default function CatalogPage() {
  return (
    <AdminOnly>
      <Catalog />
    </AdminOnly>
  );
}

type Draft = {
  id?: string;
  kind: CatalogItem["kind"];
  name: string;
  description: string;
  price: string;
  duration_min: string;
  payroll_code: string;
  taxable: boolean;
  bookable_online: boolean;
  active: boolean;
  sort_order: string;
};

const blank: Draft = {
  kind: "service",
  name: "",
  description: "",
  price: "",
  duration_min: "45",
  payroll_code: "",
  taxable: false,
  bookable_online: false,
  active: true,
  sort_order: "100",
};

const KIND_LABEL = { service: "Service", product: "Product", fee: "Fee" } as const;

function Catalog() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("catalog_items").select("*").order("kind").order("sort_order").order("name");
    setItems((data as CatalogItem[]) ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  function edit(i: CatalogItem) {
    setFlash(null);
    setDraft({
      id: i.id,
      kind: i.kind,
      name: i.name,
      description: i.description ?? "",
      price: centsToDollars(i.price_cents),
      duration_min: i.duration_min ? String(i.duration_min) : "",
      payroll_code: i.payroll_code ?? "",
      taxable: i.taxable,
      bookable_online: i.bookable_online,
      active: i.active,
      sort_order: String(i.sort_order),
    });
  }

  async function save() {
    if (!supabase || !draft) return;
    const price = dollarsToCents(draft.price);
    if (!draft.name.trim()) return setFlash({ tone: "error", text: "Enter a name." });
    if (price === null) return setFlash({ tone: "error", text: "Enter a price, like 75.00." });
    const row = {
      kind: draft.kind,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      price_cents: price,
      duration_min: draft.duration_min ? Number(draft.duration_min) : null,
      payroll_code: draft.payroll_code.trim().toUpperCase() || null,
      taxable: draft.taxable,
      bookable_online: draft.kind === "fee" ? false : draft.bookable_online,
      active: draft.active,
      sort_order: Number(draft.sort_order) || 0,
    };
    setBusy(true);
    const { error } = draft.id
      ? await supabase.from("catalog_items").update(row).eq("id", draft.id)
      : await supabase.from("catalog_items").insert(row);
    setBusy(false);
    if (error) return setFlash({ tone: "error", text: await errorMessage(error, "Couldn't save. Check the payroll code is letters or numbers only.") });
    setDraft(null);
    setFlash({ tone: "success", text: `${row.name} saved. The website shows the change right away.` });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Services and prices"
        actions={
          <Button
            onClick={() => {
              setFlash(null);
              setDraft({ ...blank });
            }}
          >
            Add an item
          </Button>
        }
      >
        Items marked &quot;Online&quot; can be booked from the website. Existing bookings keep the price they were booked at.
      </PageHeader>

      {flash && (
        <div className="mt-5">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          {!items ? (
            <Loading />
          ) : items.length === 0 ? (
            <Empty>Nothing in the catalog yet.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-dune bg-shell">
              <table className="w-full min-w-[620px] text-left">
                <thead className="border-b border-dune text-[0.9rem] text-drift">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Item</th>
                    <th className="px-4 py-2.5 font-semibold">Price</th>
                    <th className="px-4 py-2.5 font-semibold">Minutes</th>
                    <th className="px-4 py-2.5 font-semibold">Shown</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dune">
                  {items.map((i) => (
                    <tr key={i.id} className={i.active ? "" : "text-drift"}>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold">{i.name}</span>
                        <span className="block text-[0.85rem] text-drift">
                          {KIND_LABEL[i.kind]}
                          {i.payroll_code ? `, payroll ${i.payroll_code}` : ""}
                          {i.taxable ? ", GST" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{money(i.price_cents)}</td>
                      <td className="px-4 py-2.5">{i.duration_min ?? ""}</td>
                      <td className="px-4 py-2.5">
                        {!i.active ? <Pill tone="drift">Hidden</Pill> : i.bookable_online ? <Pill tone="kelp">Online</Pill> : <Pill tone="sand">Staff only</Pill>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="secondary" size="sm" onClick={() => edit(i)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {draft && (
          <Panel title={draft.id ? `Edit ${draft.name}` : "Add an item"} className="xl:sticky xl:top-8 xl:self-start">
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Field label="Type">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                      <option value="service">Service</option>
                      <option value="product">Product</option>
                      <option value="fee">Fee</option>
                    </select>
                  )}
                </Field>
                <Field label="Name">{(id) => <input id={id} className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
              </div>
              <Field label="Description" hint="Shown on the website and booking form.">
                {(id) => <textarea id={id} rows={2} className={textareaClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Price ($)">{(id) => <input id={id} inputMode="decimal" className={inputClass} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />}</Field>
                <Field label="Minutes">{(id) => <input id={id} type="number" min={5} max={480} className={inputClass} value={draft.duration_min} onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })} />}</Field>
                <Field label="Order">{(id) => <input id={id} type="number" className={inputClass} value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />}</Field>
              </div>
              <Field label="Payroll code" hint="For paid nurse visits, like AF or CF. Leave blank otherwise.">
                {(id) => <input id={id} className={`${inputClass} uppercase`} maxLength={8} value={draft.payroll_code} onChange={(e) => setDraft({ ...draft, payroll_code: e.target.value })} />}
              </Field>
              <Check label="Charge GST" hint="Nursing services are usually exempt; products usually aren't." checked={draft.taxable} onChange={(v) => setDraft({ ...draft, taxable: v })} />
              {draft.kind !== "fee" && (
                <Check label="Bookable online" hint="Clients can choose it on the website." checked={draft.bookable_online} onChange={(v) => setDraft({ ...draft, bookable_online: v })} />
              )}
              <Check label="Active" hint="Hidden items can't be added to new bookings." checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
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
