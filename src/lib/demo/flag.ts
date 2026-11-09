// True in the prototype build (NEXT_PUBLIC_DEMO_MODE=true): the same app, with the
// database running in the browser on made-up data instead of in Supabase.
// Everything else for the prototype is loaded on demand from ./api and ./backend,
// so a normal build doesn't carry it.
export const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const DEMO_URL = "https://aloha-demo.invalid";
export const DEMO_KEY = "prototype-publishable-key";
export const DEMO_PASSWORD = "aloha-prototype";
export const DEMO_STAFF = {
  office: { email: "office@example.com", label: "Office manager" },
  nurse: { email: "leilani@example.com", label: "Nurse: Leilani Cruz" },
} as const;
