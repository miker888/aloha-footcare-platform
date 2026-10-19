"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PalmMark } from "@/components/Logo";
import { MfaChallenge } from "./MfaChallenge";
import { Button, ButtonLink, Loading, Panel } from "./ui";

export type Staff = { role: "admin" | "nurse"; userId: string; email: string; name: string | null };

const StaffContext = createContext<Staff | null>(null);

export function useStaff(): Staff {
  const staff = useContext(StaffContext);
  if (!staff) throw new Error("useStaff must be used inside AdminShell");
  return staff;
}

type State =
  | { kind: "loading" }
  | { kind: "not_connected" }
  | { kind: "needs_code" }
  | { kind: "needs_mfa_setup"; email: string; userId: string }
  | { kind: "no_role"; email: string; userId: string }
  | { kind: "ready"; staff: Staff };

const ADMIN_NAV = [
  { href: "/admin/", label: "Dispatch" },
  { href: "/admin/new-booking/", label: "New booking" },
  { href: "/admin/clients/", label: "Clients" },
  { href: "/admin/nurses/", label: "Nurses" },
  { href: "/admin/catalog/", label: "Services and prices" },
  { href: "/admin/payments/", label: "Payments" },
  { href: "/admin/settings/", label: "Settings" },
];
const NURSE_NAV = [{ href: "/admin/visits/", label: "My visits" }];

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = norm(usePathname() ?? "/");
  const [state, setState] = useState<State>({ kind: supabase ? "loading" : "not_connected" });
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/admin/login/");
      return;
    }
    const user = session.user;
    const [roleRes, aalRes, settingsRes, profileRes] = await Promise.all([
      supabase.rpc("my_role"),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.from("settings").select("require_mfa").single(),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    const role = roleRes.data as string | null;
    const email = user.email ?? "";
    if (role === "admin" || role === "nurse") {
      setState({
        kind: "ready",
        staff: { role, userId: user.id, email, name: (profileRes.data?.full_name as string | null) ?? null },
      });
      return;
    }
    if (aalRes.data?.currentLevel === "aal1" && aalRes.data?.nextLevel === "aal2") {
      setState({ kind: "needs_code" });
      return;
    }
    const verified = (user.factors ?? []).some((f) => f.status === "verified");
    if (settingsRes.data?.require_mfa && !verified) {
      setState({ kind: "needs_mfa_setup", email, userId: user.id });
      return;
    }
    setState({ kind: "no_role", email, userId: user.id });
  }, [router]);

  useEffect(() => {
    if (!supabase) return;
    // Defer to after paint; load() sets state once the session is known.
    const t = setTimeout(() => void load(), 0);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/admin/login/");
    });
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, [load, router]);

  // Nurses land on their own visit list.
  useEffect(() => {
    if (state.kind === "ready" && state.staff.role === "nurse" && pathname === "/admin/") {
      router.replace("/admin/visits/");
    }
  }, [state, pathname, router]);

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/admin/login/");
  }

  const onAccountPage = pathname.startsWith("/admin/account/");

  if (state.kind === "loading") return <Centered><Loading /></Centered>;

  if (state.kind === "not_connected") {
    return (
      <Centered>
        <Panel title="Not connected yet">
          <p className="text-drift">
            This copy of the site isn&apos;t connected to a database. Add the Supabase URL and publishable key to{" "}
            <code>.env.production</code> (see the README) and deploy again.
          </p>
        </Panel>
      </Centered>
    );
  }

  if (state.kind === "needs_code") {
    return (
      <Centered>
        <Panel title="Two-step sign-in">
          <MfaChallenge onDone={() => void load()} />
        </Panel>
      </Centered>
    );
  }

  if (state.kind === "needs_mfa_setup" || state.kind === "no_role") {
    if (onAccountPage) {
      // Signed in without access yet: allow the account page (set a password, turn on two-step sign-in).
      return (
        <StaffContext.Provider value={{ role: "nurse", userId: state.userId, email: state.email, name: null }}>
          <div className="admin min-h-screen">
            <div className="mx-auto max-w-3xl px-4 py-8">
              <div className="mb-6 flex items-center justify-between">
                <Link href="/admin/" className="font-semibold text-palm underline-offset-4 hover:underline">
                  Back
                </Link>
                <Button variant="quiet" onClick={signOut}>
                  Sign out
                </Button>
              </div>
              {children}
            </div>
          </div>
        </StaffContext.Provider>
      );
    }
    return (
      <Centered>
        <Panel title={state.kind === "needs_mfa_setup" ? "Set up two-step sign-in" : "No access yet"}>
          {state.kind === "needs_mfa_setup" ? (
            <p className="text-drift">
              Aloha Footcare requires two-step sign-in for staff. Set it up on your account page with an authenticator
              app, then sign in again.
            </p>
          ) : (
            <p className="text-drift">
              You&apos;re signed in as <strong className="text-ink">{state.email}</strong>, but your account hasn&apos;t
              been given access. Ask the clinic owner to give you a role in Settings.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/admin/account/">Go to your account</ButtonLink>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Panel>
      </Centered>
    );
  }

  const { staff } = state;
  const nav = staff.role === "admin" ? ADMIN_NAV : NURSE_NAV;
  const isActive = (href: string) => (href === "/admin/" ? pathname === "/admin/" : pathname.startsWith(href));

  return (
    <StaffContext.Provider value={staff}>
      <div className="admin min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-dune bg-shell lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-16 items-center justify-between px-4 lg:h-20 lg:px-5">
            <Link href={staff.role === "admin" ? "/admin/" : "/admin/visits/"} className="flex items-center gap-2 text-palm">
              <PalmMark className="h-10 w-auto" />
              <span className="leading-tight">
                <span className="block font-display text-[1.25rem] text-ink">Aloha</span>
                <span className="block text-[0.8rem] font-semibold text-drift">Staff</span>
              </span>
            </Link>
            <button
              type="button"
              className="rounded-lg border border-dune-deep px-3 py-1.5 font-semibold text-ink lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="admin-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
          </div>
          <nav
            id="admin-nav"
            aria-label="Staff"
            className={`${menuOpen ? "block" : "hidden"} px-3 pb-4 lg:flex lg:h-[calc(100vh-5rem)] lg:flex-col lg:justify-between`}
          >
            <ul className="space-y-0.5">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2.5 font-semibold ${isActive(item.href) ? "bg-leaf text-palm-deep" : "text-ink hover:bg-sand"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-dune pt-4">
              <p className="truncate px-3 text-[0.9rem] text-drift" title={staff.email}>
                {staff.name ?? staff.email}
              </p>
              <Link
                href="/admin/account/"
                onClick={() => setMenuOpen(false)}
                className={`mt-1 block rounded-lg px-3 py-2 font-semibold ${isActive("/admin/account/") ? "bg-leaf text-palm-deep" : "text-ink hover:bg-sand"}`}
              >
                Your account
              </Link>
              <button type="button" onClick={signOut} className="block w-full rounded-lg px-3 py-2 text-left font-semibold text-ink hover:bg-sand">
                Sign out
              </button>
            </div>
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </StaffContext.Provider>
  );
}

/** Wrap admin-only pages. Nurses see a short note instead. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const staff = useStaff();
  if (staff.role !== "admin") {
    return (
      <Panel title="Admins only">
        <p className="text-drift">This page is for the office team.</p>
        <div className="mt-4">
          <ButtonLink href="/admin/visits/" variant="secondary">
            Go to my visits
          </ButtonLink>
        </div>
      </Panel>
    );
  }
  return <>{children}</>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin flex min-h-screen items-start justify-center px-4 pt-[12vh]">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
