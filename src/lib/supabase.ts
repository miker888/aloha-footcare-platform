import { createClient, FunctionRegion, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Null until the project's URL and publishable key are set, so the site still
// builds and the public pages still render before Supabase is connected.
// Both values are public by design; Row Level Security protects the data.
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const isConnected = supabase !== null;

// Edge Functions run in Canada, next to the database.
export const FUNCTION_REGION = FunctionRegion.CaCentral1;

type ErrorLike = { message?: string; code?: string; context?: unknown } | null | undefined;

/**
 * Turns a Supabase or Edge Function error into a sentence for the screen.
 * Database validation messages (code P0001) are written for people already.
 */
export async function errorMessage(error: ErrorLike, fallback = "Something went wrong. Try again."): Promise<string> {
  if (!error) return fallback;
  const ctx = error.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // not JSON
    }
    return fallback;
  }
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "23P01") return "That nurse already has a visit at that time.";
  if (error.code === "42501") return "Your account doesn't have permission to do that.";
  if (error.message?.includes("Failed to fetch")) return "Can't reach the server. Check your connection and try again.";
  return fallback;
}
