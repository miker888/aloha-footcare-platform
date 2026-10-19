"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, Field, inputClass, Notice } from "./ui";

/** Asks for the 6-digit code from the staff member's authenticator app. */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (listError || !factor) {
      setBusy(false);
      setError("No authenticator app is set up on this account.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (verifyError) {
      setError("That code didn't work. Codes change every 30 seconds, so try the newest one.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-drift">Enter the 6-digit code from your authenticator app.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Code">
        {(id) => (
          <input
            id={id}
            className={`${inputClass} max-w-[12rem] text-center text-[1.3rem] tracking-[0.3em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        )}
      </Field>
      <Button type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Verify"}
      </Button>
    </form>
  );
}
