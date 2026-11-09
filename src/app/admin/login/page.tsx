"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DEMO_PASSWORD, DEMO_STAFF } from "@/lib/demo/flag";
import { isDemo, supabase } from "@/lib/supabase";
import { absoluteUrl } from "@/lib/url";
import { Logo } from "@/components/Logo";
import { MfaChallenge } from "@/components/admin/MfaChallenge";
import { Button, Field, inputClass, Notice, Panel } from "@/components/admin/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"password" | "code" | "reset-sent">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight in. (Not in the prototype, where this page
  // is also how you switch between the office and nurse views.)
  useEffect(() => {
    if (!supabase || isDemo) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/admin/");
    });
  }, [router]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setBusy(false);
      setError("That email and password don't match. Check them and try again.");
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(false);
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      setStage("code");
      return;
    }
    router.replace("/admin/");
  }

  async function sendReset() {
    if (!supabase) return;
    if (!email.trim()) {
      setError("Enter your email first, then choose Forgot password.");
      return;
    }
    setBusy(true);
    setError(null);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: absoluteUrl("/admin/account/?reset=1") });
    setBusy(false);
    setStage("reset-sent");
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-sand px-4 pt-[10vh]">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-block rounded-md">
          <Logo alt="Aloha Footcare, home" className="h-28 w-auto" />
        </Link>
        <Panel title="Staff sign in">
          {isDemo ? (
            <DemoSignIn />
          ) : !supabase ? (
            <p className="text-drift">This copy of the site isn&apos;t connected to a database yet.</p>
          ) : stage === "code" ? (
            <MfaChallenge onDone={() => router.replace("/admin/")} />
          ) : stage === "reset-sent" ? (
            <div className="space-y-4">
              <Notice tone="success">Check your email.</Notice>
              <p className="text-drift">
                If an account exists for {email.trim()}, we&apos;ve sent a link to set a new password.
              </p>
              <Button variant="secondary" onClick={() => setStage("password")}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={signIn} className="space-y-4">
              {error && <Notice tone="error">{error}</Notice>}
              <Field label="Email">
                {(id) => (
                  <input id={id} type="email" autoComplete="username" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
                )}
              </Field>
              <Field label="Password">
                {(id) => (
                  <input
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button type="submit" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
                <Button type="button" variant="quiet" onClick={sendReset} disabled={busy}>
                  Forgot password?
                </Button>
              </div>
            </form>
          )}
        </Panel>
        <p className="mt-6 text-[0.9rem] text-drift">
          For Aloha Footcare staff. Client records are private health information; every record you open is logged.
        </p>
      </div>
    </div>
  );
}

type Who = keyof typeof DEMO_STAFF;

/** Prototype only: sign in as one of the two sample staff accounts. */
function DemoSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState<Who | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signInAs = useCallback(
    async (who: Who) => {
      if (!supabase) return;
      setBusy(who);
      setError(null);
      await supabase.auth.signOut({ scope: "local" });
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_STAFF[who].email,
        password: DEMO_PASSWORD,
      });
      if (signInError) {
        setBusy(null);
        setError("The prototype couldn't sign you in. Reload the page and try again.");
        return;
      }
      router.replace(who === "nurse" ? "/admin/visits/" : "/admin/");
    },
    [router],
  );

  // Links from the guided tour: /admin/login/?as=office or ?as=nurse
  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get("as");
    if (as !== "office" && as !== "nurse") return;
    const timer = setTimeout(() => void signInAs(as), 0);
    return () => clearTimeout(timer);
  }, [signInAs]);

  const choices: { who: Who; detail: string }[] = [
    { who: "office", detail: "Dispatch queue, bookings, clients, nurses, prices, payments and settings." },
    { who: "nurse", detail: "Only her own visits, with the notes she needs at the door." },
  ];

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-drift">Choose who to be. In the live system each person signs in with their own email and password.</p>
      <ul className="space-y-3">
        {choices.map(({ who, detail }) => (
          <li key={who}>
            <button
              type="button"
              onClick={() => signInAs(who)}
              disabled={busy !== null}
              className="w-full rounded-xl border-2 border-dune bg-shell px-4 py-3 text-left hover:border-palm disabled:opacity-60"
            >
              <span className="block font-semibold text-palm">
                {busy === who ? "Signing in…" : DEMO_STAFF[who].label}
              </span>
              <span className="block text-[0.95rem] text-drift">{detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
