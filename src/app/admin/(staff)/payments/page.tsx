"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dateTime, downloadFile, money, shortDate, toCSV, todayISO } from "@/lib/format";
import { METHOD, PAYMENT, TXN_TYPE } from "@/lib/labels";
import type { LedgerRow, PayrollRow } from "@/lib/types";
import { AdminOnly } from "@/components/admin/AdminShell";
import { Button, Empty, Field, inputClass, Loading, PageHeader, Panel } from "@/components/admin/ui";

export default function PaymentsPage() {
  return (
    <AdminOnly>
      <Payments />
    </AdminOnly>
  );
}

function Payments() {
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [payroll, setPayroll] = useState<PayrollRow[] | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !from || !to) return;
    setLedger(null);
    setPayroll(null);
    const [l, p] = await Promise.all([
      supabase.rpc("ledger", { p_from: from, p_to: to }),
      supabase.rpc("payroll_visits", { p_from: from, p_to: to }),
    ]);
    setLedger((l.data as LedgerRow[]) ?? []);
    setPayroll((p.data as PayrollRow[]) ?? []);
  }, [from, to]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const totals = useMemo(() => {
    const rows = ledger ?? [];
    const sum = (f: (r: LedgerRow) => boolean) => rows.filter(f).reduce((s, r) => s + r.amount_cents, 0);
    const byMethod = new Map<string, number>();
    rows.forEach((r) => byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount_cents));
    return {
      payments: sum((r) => r.type === "payment"),
      refunds: sum((r) => r.type === "refund"),
      net: sum(() => true),
      byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [ledger]);

  const visitsByNurse = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    (payroll ?? [])
      .filter((r) => r.payroll_code)
      .forEach((r) => {
        const key = r.nurse_name ?? "Unassigned";
        const counts = m.get(key) ?? {};
        counts[r.payroll_code!] = (counts[r.payroll_code!] ?? 0) + r.quantity;
        m.set(key, counts);
      });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [payroll]);

  function exportLedger() {
    if (!ledger) return;
    const csv = toCSV(
      ledger.map((r) => ({
        ...r,
        occurred_at: dateTime(r.occurred_at),
        amount: (r.amount_cents / 100).toFixed(2),
        type: TXN_TYPE[r.type],
        method: METHOD[r.method],
      })),
      [
        { key: "occurred_at", label: "Date" },
        { key: "reference", label: "Booking" },
        { key: "client_name", label: "Client" },
        { key: "type", label: "Type" },
        { key: "method", label: "Method" },
        { key: "amount", label: "Amount (CAD)" },
        { key: "note", label: "Note" },
        { key: "stripe_payment_intent_id", label: "Stripe payment" },
        { key: "stripe_refund_id", label: "Stripe refund" },
      ],
    );
    downloadFile(`aloha-transactions-${from}-to-${to}.csv`, csv);
  }

  function exportPayroll() {
    if (!payroll) return;
    const csv = toCSV(
      payroll.map((r) => ({
        ...r,
        unit_price: (r.unit_price_cents / 100).toFixed(2),
        line_total: (r.line_total_cents / 100).toFixed(2),
        payment_status: PAYMENT[r.payment_status],
      })),
      [
        { key: "visit_date", label: "Visit date" },
        { key: "reference", label: "Booking" },
        { key: "nurse_name", label: "Nurse" },
        { key: "client_name", label: "Client" },
        { key: "area_name", label: "Area" },
        { key: "item_name", label: "Item" },
        { key: "payroll_code", label: "Payroll code" },
        { key: "quantity", label: "Quantity" },
        { key: "unit_price", label: "Unit price" },
        { key: "line_total", label: "Line total" },
        { key: "payment_status", label: "Payment" },
      ],
    );
    downloadFile(`aloha-completed-visits-${from}-to-${to}.csv`, csv);
  }

  return (
    <div>
      <PageHeader title="Payments">Every payment, refund and adjustment, plus completed visits for payroll.</PageHeader>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="From">{(id) => <input id={id} type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(id) => <input id={id} type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>

      {!ledger || !payroll ? (
        <Loading />
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Payments" value={money(totals.payments)} />
            <Stat label="Refunds" value={money(totals.refunds)} />
            <Stat label="Net" value={money(totals.net)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Panel
              title="Transactions"
              actions={
                <Button variant="secondary" size="sm" disabled={ledger.length === 0} onClick={exportLedger}>
                  Download CSV
                </Button>
              }
            >
              {ledger.length === 0 ? (
                <Empty>No transactions in these dates.</Empty>
              ) : (
                <div className="-mx-4 overflow-x-auto sm:-mx-5">
                  <table className="w-full min-w-[600px] text-left">
                    <thead className="text-[0.9rem] text-drift">
                      <tr>
                        <th className="px-4 py-2 font-semibold sm:px-5">Date</th>
                        <th className="px-4 py-2 font-semibold">Booking</th>
                        <th className="px-4 py-2 font-semibold">What</th>
                        <th className="px-4 py-2 text-right font-semibold sm:px-5">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dune border-t border-dune">
                      {ledger.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 sm:px-5">{dateTime(r.occurred_at)}</td>
                          <td className="px-4 py-2">
                            {r.booking_id ? (
                              <Link href={`/admin/booking/?id=${r.booking_id}`} className="font-semibold text-palm underline-offset-4 hover:underline">
                                {r.reference}
                              </Link>
                            ) : (
                              ""
                            )}
                            <span className="block text-[0.85rem] text-drift">{r.client_name}</span>
                          </td>
                          <td className="px-4 py-2">
                            {TXN_TYPE[r.type]}, {METHOD[r.method]}
                            {r.note && <span className="block text-[0.85rem] text-drift">{r.note}</span>}
                          </td>
                          <td className={`px-4 py-2 text-right font-semibold sm:px-5 ${r.amount_cents < 0 ? "text-alert" : ""}`}>{money(r.amount_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel title="By method">
                {totals.byMethod.length === 0 ? (
                  <p className="text-drift">Nothing yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {totals.byMethod.map(([m, cents]) => (
                      <li key={m} className="flex justify-between">
                        <span>{METHOD[m as keyof typeof METHOD] ?? m}</span>
                        <span className="font-semibold">{money(cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Completed visits for payroll"
                actions={
                  <Button variant="secondary" size="sm" disabled={payroll.length === 0} onClick={exportPayroll}>
                    Download CSV
                  </Button>
                }
              >
                {visitsByNurse.length === 0 ? (
                  <p className="text-drift">No completed visits in these dates.</p>
                ) : (
                  <ul className="divide-y divide-dune">
                    {visitsByNurse.map(([nurse, counts]) => (
                      <li key={nurse} className="flex justify-between gap-3 py-2">
                        <span className="font-semibold">{nurse}</span>
                        <span className="text-drift">
                          {Object.entries(counts)
                            .map(([code, n]) => `${n} ${code}`)
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[0.9rem] text-drift">
                  Dates use the visit date, {shortDate(from)} to {shortDate(to)}. Only items with a payroll code count as paid
                  visits.
                </p>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dune bg-shell px-5 py-4">
      <p className="text-[0.9rem] font-semibold text-drift">{label}</p>
      <p className="mt-1 font-display text-[1.7rem] text-ink">{value}</p>
    </div>
  );
}
