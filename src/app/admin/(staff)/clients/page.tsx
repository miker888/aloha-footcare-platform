"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { shortDate } from "@/lib/format";
import type { ClientRow } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { ButtonLink, Empty, inputClass, Loading, PageHeader } from "@/components/admin/ui";

export default function ClientsPage() {
  return (
    <AdminOnly>
      <Clients />
    </AdminOnly>
  );
}

function Clients() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClientRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await supabase!.rpc("search_clients", { p_query: q.trim() });
      if (alive) setRows((data as ClientRow[]) ?? []);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div>
      <PageHeader title="Clients" actions={<ButtonLink href="/admin/new-booking/">New booking</ButtonLink>}>
        Search by name, phone, email or family contact.
      </PageHeader>
      <div className="mt-5">
        <label htmlFor="client-search" className="sr-only">
          Search clients
        </label>
        <input id="client-search" className={`${inputClass} max-w-md`} placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-5">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No clients match.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-dune bg-shell">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-dune text-[0.9rem] text-drift">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 font-semibold">City</th>
                  <th className="px-4 py-2.5 font-semibold">Visits</th>
                  <th className="px-4 py-2.5 font-semibold">Last visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dune">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-sand/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/client/?id=${r.id}`} className="font-semibold text-clay underline-offset-4 hover:underline">
                        {r.last_name}, {r.first_name}
                      </Link>
                      {r.contact_name && <span className="block text-[0.85rem] text-drift">Contact: {r.contact_name}</span>}
                    </td>
                    <td className="px-4 py-2.5">{r.phone ?? <span className="text-drift">None</span>}</td>
                    <td className="px-4 py-2.5">{r.city}</td>
                    <td className="px-4 py-2.5">{r.booking_count}</td>
                    <td className="px-4 py-2.5">{r.last_visit ? shortDate(r.last_visit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.length === 100 && <p className="mt-3 text-drift">Showing the first 100. Search to narrow it down.</p>}
      </div>
    </div>
  );
}
