"use client";

import Link from "next/link";
import { useId } from "react";
import { PAYMENT, STATUS } from "@/lib/labels";
import type { BookingStatus, PaymentStatus } from "@/lib/types";

// Small set of building blocks for the staff screens.

const inputBase =
  "block h-11 rounded-lg border border-dune-deep bg-shell px-3 text-[1rem] text-ink placeholder:text-drift/70 focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/25 disabled:opacity-60";
export const inputClass = `${inputBase} w-full`;
/** For selects and inputs that sit inline in a toolbar. */
export const inlineInputClass = inputBase;
export const textareaClass =
  "block w-full rounded-lg border border-dune-deep bg-shell px-3 py-2.5 text-[1rem] text-ink placeholder:text-drift/70 focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/25";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger" | "kelp";
  size?: "md" | "sm";
};

const variants = {
  primary: "bg-clay text-shell hover:bg-clay-deep",
  kelp: "bg-kelp text-shell hover:bg-[#244839]",
  secondary: "border border-dune-deep bg-shell text-ink hover:border-clay hover:text-clay",
  quiet: "text-ink underline-offset-4 hover:text-clay hover:underline",
  danger: "border border-alert/40 bg-shell text-alert hover:bg-blush",
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  const sizing = size === "sm" ? "h-9 px-3 text-[0.95rem]" : "h-11 px-4 text-[1rem]";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-55 ${sizing} ${variants[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
  className = "",
}: {
  href: string;
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-[1rem] font-semibold ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[0.95rem] font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="text-[0.9rem] text-drift">{hint}</p>}
      <div className="mt-1.5">{children(id)}</div>
    </div>
  );
}

export function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-clay" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-ink">{label}</span>
        {hint && <span className="block text-[0.9rem] text-drift">{hint}</span>}
      </span>
    </label>
  );
}

export function PageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dune pb-5">
      <div>
        <h1 className="text-[1.9rem] leading-tight text-ink">{title}</h1>
        {children && <div className="mt-1 text-drift">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-dune bg-shell ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-dune px-4 py-3 sm:px-5">
          {title && <h2 className="font-sans text-[1.05rem] font-bold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

type Tone = "clay" | "kelp" | "drift" | "alert" | "sand";
const tones: Record<Tone, string> = {
  clay: "bg-blush text-clay-deep",
  kelp: "bg-sea text-kelp",
  drift: "bg-dune/70 text-drift",
  alert: "bg-blush text-alert",
  sand: "bg-sand text-ink border border-dune",
};

export function Pill({ tone = "drift", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.85rem] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

const statusTone: Record<BookingStatus, Tone> = {
  awaiting_payment: "alert",
  new: "clay",
  assigned: "sand",
  confirmed: "kelp",
  completed: "drift",
  cancelled: "drift",
  no_show: "alert",
};

export function StatusPill({ status }: { status: BookingStatus }) {
  return <Pill tone={statusTone[status]}>{STATUS[status]}</Pill>;
}

const paymentTone: Record<PaymentStatus, Tone> = {
  unpaid: "alert",
  partially_paid: "clay",
  paid: "kelp",
  partially_refunded: "clay",
  refunded: "drift",
  not_required: "drift",
};

export function PaymentPill({ status }: { status: PaymentStatus }) {
  return <Pill tone={paymentTone[status]}>{PAYMENT[status]}</Pill>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: React.ReactNode }) {
  const styles = {
    info: "border-dune bg-sand text-ink",
    error: "border-alert/30 bg-blush text-alert",
    success: "border-kelp/30 bg-sea text-kelp",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 font-semibold ${styles}`}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-dune-deep px-4 py-6 text-center text-drift">{children}</p>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="py-10 text-center text-drift" aria-live="polite">
      {label}
    </p>
  );
}
