"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStaff } from "@/components/admin/AdminShell";
import { Button, Field, inputClass, Loading, Notice, PageHeader, Panel } from "@/components/admin/ui";

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Account />
    </Suspense>
  );
}

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

function Account() {
  const staff = useStaff();
  const reset = useSearchParams().get("reset") === "1";
  return (
    <div className="max-w-2xl">
      <PageHeader title="Your account">{staff.email}</PageHeader>
      <div className="mt-6 space-y-6">
        {reset && <Notice tone="info">Choose a new password to finish signing in.</Notice>}
        <Password />
        <TwoStep />
      </div>
    </div>
  );
}

function Password() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (pw.length < 12) return setMsg({ tone: "error", text: "Use at least 12 characters." });
    if (pw !== pw2) return setMsg({ tone: "error", text: "The two passwords don't match." });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: error.message || "Couldn't change the password." });
    setPw("");
    setPw2("");
    setMsg({ tone: "success", text: "Password changed." });
  }

  return (
    <Panel title="Password">
      <form onSubmit={save} className="space-y-3">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" hint="At least 12 characters.">
            {(id) => <input id={id} type="password" autoComplete="new-password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} />}
          </Field>
          <Field label="Type it again">
            {(id) => <input id={id} type="password" autoComplete="new-password" className={inputClass} value={pw2} onChange={(e) => setPw2(e.target.value)} />}
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Panel>
  );
}

function TwoStep() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp as Factor[]) ?? []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function start() {
    if (!supabase) return;
    setMsg(null);
    // Clear any half-finished setup first.
    for (const f of factors ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) return setMsg({ tone: "error", text: "Couldn't start the setup. Try again." });
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!supabase || !enrolling) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: code.trim() });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: "That code didn't work. Try the newest code in the app." });
    setEnrolling(null);
    setCode("");
    setMsg({ tone: "success", text: "Two-step sign-in is on. You'll be asked for a code each time you sign in." });
    await load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return setMsg({ tone: "error", text: "Couldn't turn it off. Sign in with your code first, then try again." });
    setMsg({ tone: "success", text: "Two-step sign-in is off for your account." });
    await load();
  }

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  return (
    <Panel title="Two-step sign-in">
      {msg && (
        <div className="mb-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      {!factors ? (
        <Loading />
      ) : enrolling ? (
        <div className="space-y-4">
          <p>Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password), then enter the code it shows.</p>
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qr} alt="QR code for your authenticator app" className="h-48 w-48 rounded-lg border border-dune bg-white p-2" />
          <p className="text-[0.9rem] text-drift">
            Can&apos;t scan? Enter this key instead: <code className="break-all font-semibold text-ink">{enrolling.secret}</code>
          </p>
          <Field label="Code from the app">
            {(id) => (
              <input
                id={id}
                className={`${inputClass} max-w-[12rem] text-center tracking-[0.3em]`}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button disabled={busy || code.length !== 6} onClick={() => void verify()}>
              Turn on
            </Button>
            <Button variant="quiet" onClick={() => setEnrolling(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : verified.length ? (
        <div className="space-y-3">
          <p>On. Your account asks for a code from your authenticator app when you sign in.</p>
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-dune p-3">
              <span>{f.friendly_name ?? "Authenticator app"}</span>
              <Button size="sm" variant="danger" onClick={() => void remove(f.id)}>
                Turn off
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p>
            Off. Turn it on so a stolen password alone can&apos;t open client records. You&apos;ll need an authenticator
            app on your phone.
          </p>
          <Button onClick={() => void start()}>Set up two-step sign-in</Button>
        </div>
      )}
    </Panel>
  );
}
