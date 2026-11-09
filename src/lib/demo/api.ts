// Prototype only: answers the Supabase client's requests in the browser.
//
// The app talks to Supabase exactly as it will in production. In the prototype
// its fetch is replaced by this function, which serves the REST, RPC, Auth and
// Edge Function routes the app uses from the in-browser Postgres. Every request
// runs as the same database role it would in Supabase (anon, authenticated or
// service_role), with the caller's claims set, so the real Row Level Security
// rules and database functions decide what each person can see and do.
//
// Each request is sent as one SQL message: Postgres runs it as a single
// transaction, and requests from several tabs can't interleave.

import { demoDb } from "./backend";
import { DEMO_PASSWORD } from "./flag";
import { absoluteUrl } from "@/lib/url";

const SERVICE = "service_role";
const IDENT = /^[a-z_][a-z0-9_]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;
type Claims = { sub?: string; email?: string; role: string; [k: string]: unknown };
class HttpError extends Error {
  constructor(public status: number, public body: unknown) {
    super("http");
  }
}

// ---------- SQL helpers ----------

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** A value as an untyped SQL literal; Postgres casts it to the column or parameter type. */
function lit(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return quote(JSON.stringify(v));
  if (typeof v === "number" && !Number.isFinite(v)) throw new HttpError(400, { message: "Invalid number" });
  return quote(String(v));
}

function ident(name: string): string {
  if (!IDENT.test(name)) throw new HttpError(400, { message: `Unsupported name: ${name}` });
  return name;
}

async function run(role: string, claims: Claims, sql: string): Promise<Row[]> {
  const db = await demoDb();
  const results = await db.exec(
    `set local role ${ident(role)}; select set_config('request.jwt.claims', ${lit(claims)}, true); ${sql}`,
  );
  return (results.at(-1)?.rows ?? []) as Row[];
}

async function runOne(role: string, claims: Claims, sql: string): Promise<unknown> {
  const rows = await run(role, claims, sql);
  const v = rows[0]?.v;
  return v === "" ? null : v ?? null;
}

const asService = (sql: string) => runOne(SERVICE, { role: SERVICE }, sql);

function rpcCall(fn: string, args: Row): string {
  const named = Object.entries(args).map(([k, v]) => `${ident(k)} => ${lit(v)}`);
  return `select to_jsonb(public.${ident(fn)}(${named.join(", ")})) as v`;
}

// ---------- Fake tokens (the prototype has no real Auth server) ----------

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeJwt(user: { id: string; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: `prototype-${user.id}`,
    iat: now,
    exp: now + 3600,
  };
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.cHJvdG90eXBl`;
}

function readJwt(token: string): Claims | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(part);
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Claims;
    if (!claims.sub || (typeof claims.exp === "number" && claims.exp * 1000 < Date.now())) return null;
    return claims;
  } catch {
    return null;
  }
}

function caller(req: Request): { role: string; claims: Claims } {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const claims = token ? readJwt(token) : null;
  return claims ? { role: "authenticated", claims } : { role: "anon", claims: { role: "anon" } };
}

const userJson = (u: { id: string; email: string }) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  factors: [],
  created_at: "2026-01-01T00:00:00Z",
});

// ---------- Responses ----------

function respond(status: number, body?: unknown): Response {
  if (status === 204 || body === undefined) return new Response(null, { status: status === 200 ? 204 : status });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function dbError(e: { code?: string; message?: string; detail?: string; hint?: string }): Response {
  const status = e.code === "42501" ? 403 : e.code === "23P01" || e.code === "23505" ? 409 : 400;
  return respond(status, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
}

async function readJson(req: Request): Promise<Row> {
  const text = await req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new HttpError(400, { message: "Invalid JSON" });
  }
}

// ---------- REST: filters, select, order ----------

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function inList(raw: string): string[] {
  const body = raw.replace(/^\(/, "").replace(/\)$/, "");
  const items: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) items.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2]);
  return items;
}

function where(params: URLSearchParams): string {
  const clauses: string[] = [];
  for (const [key, value] of params) {
    if (RESERVED.has(key)) continue;
    const col = ident(key);
    const m = value.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|ilike|like|is|in)\.([\s\S]*)$/);
    if (!m) throw new HttpError(400, { message: `Unsupported filter: ${value}` });
    const [, not, op, raw] = m;
    let sql: string;
    if (op === "is") sql = `${col} is ${raw === "null" ? "null" : raw === "true" ? "true" : "false"}`;
    else if (op === "in") {
      const items = inList(raw);
      sql = items.length ? `${col}::text in (${items.map(lit).join(", ")})` : "false";
    } else if (op === "like" || op === "ilike") sql = `${col}::text ${op} ${lit(raw.replace(/\*/g, "%"))}`;
    else if (op === "eq") sql = `${col} = ${lit(raw)}`;
    else if (op === "neq") sql = `${col} <> ${lit(raw)}`;
    else sql = `${col} ${{ gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} ${lit(raw)}`;
    clauses.push(not ? `not (${sql})` : sql);
  }
  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function selectList(sel: string | null): string {
  if (!sel || sel === "*") return "*";
  return sel
    .split(",")
    .map((c) => ident(c.trim()))
    .join(", ");
}

function orderBy(order: string | null): string {
  if (!order) return "";
  const parts = order.split(",").map((part) => {
    const [col, ...mods] = part.split(".");
    const dir = mods.includes("desc") ? "desc" : "asc";
    const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
    return `${ident(col)} ${dir}${nulls}`;
  });
  return `order by ${parts.join(", ")}`;
}

function intParam(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, { message: "Invalid limit" });
  return n;
}

async function rest(req: Request, url: URL, table: string): Promise<Response> {
  const { role, claims } = caller(req);
  const t = `public.${ident(table)}`;
  const params = url.searchParams;
  const single = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
  const wantRows = (req.headers.get("prefer") ?? "").includes("return=representation");

  if (req.method === "GET" || req.method === "HEAD") {
    const limit = intParam(params.get("limit"));
    const offset = intParam(params.get("offset"));
    const rows = (await runOne(
      role,
      claims,
      `select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) as v from (select ${selectList(params.get("select"))} from ${t} ${where(params)} ${orderBy(params.get("order"))}${limit !== null ? ` limit ${limit}` : ""}${offset !== null ? ` offset ${offset}` : ""}) q`,
    )) as Row[];
    if (single) {
      if (rows.length !== 1) {
        return respond(406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${rows.length} rows`,
          hint: null,
        });
      }
      return respond(200, rows[0]);
    }
    return respond(200, rows);
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const list = (Array.isArray(body) ? body : [body]) as Row[];
    if (!list.length) return respond(201, wantRows ? [] : undefined);
    const cols = Object.keys(list[0]).map(ident);
    const values = list.map((row) => `(${cols.map((c) => lit(row[c])).join(", ")})`).join(", ");
    const rows = (await runOne(
      role,
      claims,
      `with i as (insert into ${t} (${cols.join(", ")}) values ${values} returning *) select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) as v from i`,
    )) as Row[];
    if (!wantRows) return respond(201);
    return respond(201, single ? rows[0] : rows);
  }

  if (req.method === "PATCH") {
    const body = await readJson(req);
    const sets = Object.entries(body).map(([k, v]) => `${ident(k)} = ${lit(v)}`);
    if (!sets.length) throw new HttpError(400, { message: "Nothing to update" });
    const rows = (await runOne(
      role,
      claims,
      `with u as (update ${t} set ${sets.join(", ")} ${where(params)} returning *) select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) as v from u`,
    )) as Row[];
    if (!wantRows) return respond(204);
    return respond(200, single ? rows[0] : rows);
  }

  if (req.method === "DELETE") {
    const rows = (await runOne(
      role,
      claims,
      `with d as (delete from ${t} ${where(params)} returning *) select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) as v from d`,
    )) as Row[];
    return wantRows ? respond(200, rows) : respond(204);
  }

  return respond(405, { message: "Method not allowed" });
}

// ---------- Auth ----------

async function findUser(where: string): Promise<{ id: string; email: string } | null> {
  const db = await demoDb();
  const results = await db.exec(`select id::text, email from auth.users where ${where}`);
  return (results.at(-1)?.rows[0] as { id: string; email: string } | undefined) ?? null;
}

function session(user: { id: string; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: makeJwt(user),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `prototype-${user.id}`,
    user: userJson(user),
  };
}

const badLogin = () =>
  respond(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });

async function auth(req: Request, url: URL, route: string): Promise<Response> {
  if (route === "token") {
    const body = await readJson(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const user = await findUser(`lower(email) = lower(${lit(String(body.email ?? ""))})`);
      if (!user || body.password !== DEMO_PASSWORD) return badLogin();
      return respond(200, session(user));
    }
    if (grant === "refresh_token") {
      const id = String(body.refresh_token ?? "").replace(/^prototype-/, "");
      const user = UUID_RE.test(id) ? await findUser(`id = ${lit(id)}`) : null;
      if (!user) return respond(400, { code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return respond(200, session(user));
    }
    return badLogin();
  }
  if (route === "user") {
    const { claims } = caller(req);
    if (!claims.sub) return respond(401, { code: "bad_jwt", msg: "Sign in again to continue." });
    return respond(200, userJson({ id: claims.sub, email: String(claims.email ?? "") }));
  }
  if (route === "logout") return respond(204);
  if (route === "recover") return respond(200, {});
  if (route.startsWith("factors")) {
    return respond(422, {
      code: "mfa_not_available",
      msg: "Two-step sign-in can't be set up in the prototype. It works once the clinic's own database is connected.",
    });
  }
  return respond(404, { msg: "Not available in the prototype." });
}

// ---------- Edge Functions, in demo payment mode ----------

type BookingResult = { booking_id: string; reference: string; status: string; total_cents: number };
type Refundable = { refundable_cents: number; payment_intent_id: string | null; method: string | null };

const fnError = (status: number, error: string) => respond(status, { error });
const publicError = (e: { code?: string; message?: string }) =>
  e.code === "P0001" && e.message ? e.message : "Something went wrong. Please try again, or call us.";

async function createBooking(req: Request): Promise<Response> {
  const raw = await req.text();
  if (raw.length > 20_000) return fnError(413, "That request is too large.");
  let body: Row;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return fnError(400, "Invalid request.");
  }
  const { website, ...payload } = body;
  if (typeof website === "string" && website.trim() !== "") return fnError(400, "Invalid request.");

  let booking: BookingResult;
  try {
    booking = (await asService(rpcCall("create_booking_request", { p: payload }))) as BookingResult;
  } catch (e) {
    return fnError(400, publicError(e as { code?: string; message?: string }));
  }
  const confirmed = absoluteUrl(`/book/confirmed/?ref=${encodeURIComponent(booking.reference)}`);
  if (booking.status !== "awaiting_payment") return respond(200, { reference: booking.reference, url: confirmed });

  // Same as the real function with PAYMENTS_MODE=demo: recorded, nothing charged.
  await asService(
    rpcCall("record_online_payment", {
      p_booking_id: booking.booking_id,
      p_amount_cents: booking.total_cents,
      p_method: "demo",
      p_checkout_session_id: `demo_cs_${booking.reference}`,
      p_payment_intent_id: `demo_pi_${booking.reference}`,
    }),
  );
  return respond(200, { reference: booking.reference, url: `${confirmed}&demo=1` });
}

async function refundPayment(req: Request): Promise<Response> {
  const { role, claims } = caller(req);
  if (role !== "authenticated" || !claims.sub) return fnError(401, "Sign in again to continue.");
  const myRole = await runOne(role, claims, "select to_jsonb(public.my_role()) as v");
  if (myRole !== "admin") return fnError(403, "Only admins can issue refunds.");

  const body = await readJson(req);
  const bookingId = String(body.booking_id ?? "");
  const amount = Number(body.amount_cents);
  const reason = String(body.reason ?? "").trim().slice(0, 200);
  const requestId = String(body.request_id ?? "");
  if (!UUID_RE.test(bookingId)) return fnError(400, "Invalid booking.");
  if (!Number.isInteger(amount) || amount <= 0) return fnError(400, "Enter an amount to refund.");
  if (!reason) return fnError(400, "Add a reason for the refund.");

  const info = (await runOne(role, claims, rpcCall("booking_refundable", { p_booking_id: bookingId }))) as Refundable | null;
  if (!info || info.refundable_cents <= 0) return fnError(400, "There's no card payment left to refund on this booking.");
  if (amount > info.refundable_cents) {
    return fnError(400, `You can refund up to $${(info.refundable_cents / 100).toFixed(2)}.`);
  }
  await asService(
    rpcCall("record_refund", {
      p_booking_id: bookingId,
      p_amount_cents: amount,
      p_method: "demo",
      p_refund_id: `demo_re_${UUID_RE.test(requestId) ? requestId : crypto.randomUUID()}`,
      p_payment_intent_id: info.payment_intent_id,
      p_note: reason,
      p_actor: claims.sub,
    }),
  );
  return respond(200, { status: "succeeded", demo: true });
}

// ---------- Router ----------

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpc) {
      const { role, claims } = caller(req);
      const args = await readJson(req);
      return respond(200, await runOne(role, claims, rpcCall(rpc[1], args)));
    }
    const table = path.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (table) return await rest(req, url, table[1]);

    const authRoute = path.match(/^\/auth\/v1\/(.+)$/);
    if (authRoute) return await auth(req, url, authRoute[1]);

    if (path === "/functions/v1/create-booking") return await createBooking(req);
    if (path === "/functions/v1/refund-payment") return await refundPayment(req);

    return respond(404, { message: "Not available in the prototype." });
  } catch (e) {
    if (e instanceof HttpError) return respond(e.status, e.body);
    const err = e as { code?: string; message?: string };
    if (err?.code) return dbError(err);
    console.error("Prototype database error", e);
    return respond(500, { message: "The prototype's database couldn't start. Reload the page to try again." });
  }
}
