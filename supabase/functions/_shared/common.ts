// Shared helpers for the Edge Functions.
//
// Deploy every function pinned to Canada: the site calls them with
// region ca-central-1, and the Stripe webhook URL ends in
// ?forceFunctionRegion=ca-central-1. Health information never leaves Canada.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@23";

function readKey(jsonVar: string, legacyVar: string): string | undefined {
  const json = Deno.env.get(jsonVar);
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get(legacyVar) ?? undefined;
}

function supabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is not set");
  return url;
}

/** Full-access client (secret key). Bypasses Row Level Security: use with care. */
export function adminClient(): SupabaseClient {
  const key = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("No Supabase secret key in the environment");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the signed-in staff member, so Row Level Security applies. */
export function userClient(accessToken: string): SupabaseClient {
  const key = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!key) throw new Error("No Supabase publishable key in the environment");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Public address of the website, without a trailing slash. */
export function siteUrl(): string {
  const url = Deno.env.get("SITE_URL");
  if (!url) throw new Error("SITE_URL is not set");
  return url.replace(/\/+$/, "");
}

function allowedOrigins(): string[] {
  const list = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (list.length) return list;
  try {
    return [new URL(siteUrl()).origin];
  } catch {
    return [];
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Browser calls must come from the website. */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && allowedOrigins().includes(origin);
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * 'stripe' when a Stripe secret key is set, 'demo' only when explicitly asked
 * for and no Stripe key exists, otherwise null (online payments are off).
 */
export function paymentsMode(): "stripe" | "demo" | null {
  if (Deno.env.get("STRIPE_SECRET_KEY")) return "stripe";
  if (Deno.env.get("PAYMENTS_MODE") === "demo") return "demo";
  return null;
}

export function stripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export { Stripe };

/**
 * Messages raised on purpose by the database (plain-language validation
 * errors) are safe to show. Anything else becomes a generic message.
 */
export function publicError(error: { code?: string; message?: string } | null): string {
  if (error?.code === "P0001" && error.message) return error.message;
  return "Something went wrong on our side. Please try again, or call us to book.";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
