# Aloha Footcare platform

Website, online booking and office system for Aloha Footcare Services (Calgary mobile foot care).
Replaces the Wix site and Vagaro.

What it does today:

- **Public site**: redesigned homepage in the logo's palm green and gold on sand, services with live prices,
  privacy notice.
- **Online booking**: a 4-step request form for seniors and their families. The server prices it from the
  catalog, payment holds the request (Stripe, or demo mode until Stripe is connected), and it lands in the
  dispatch queue.
- **Dispatch board**: every request is funnelled into one queue first. The office matches a nurse (nurses who
  cover the area and have the lightest day are listed first), confirms the time with the client, then marks
  the visit completed. A nurse can't be double-booked.
- **Phone bookings**: staff enter calls, residence visits and walk-ins with the same pricing.
- **Payments**: every payment, refund and adjustment is recorded and can't be edited after the fact. Card
  refunds go through Stripe; cash, e-transfer, cheque and insurance are recorded by hand. CSV exports for
  the bookkeeper and for payroll (completed visits by nurse, with AF/CF codes).
- **Catalog**: services, products and fees with prices, GST, payroll codes and "bookable online", editable
  by the office. Areas carry their own travel charge.
- **Staff**: admin and nurse roles, optional two-step sign-in (required for everyone with one switch), and
  a nurse view listing only their own visits.

Not in this version: clinical charting, email/SMS reminders, Vagaro data import, route optimisation. See
[Next steps](#next-steps).

## How it fits together

```
 Browser (GitHub Pages, static)          Supabase, Canada (Central)               Stripe
 ───────────────────────────────         ───────────────────────────────          ──────────
 Public site + booking form  ── POST ──▶ Edge Function create-booking ─────────▶  Checkout
                                         │  validates + prices in Postgres         (amount,
 Staff screens (/admin) ── signed in ──▶ │  Postgres + Row Level Security           reference,
                                         │  Auth (passwords, two-step codes)        email only)
                                         Edge Function stripe-webhook  ◀──────────  payment / refund events
                                         Edge Function refund-payment  ─────────▶  refunds
```

- **Next.js 16**, exported as a static site and deployed to GitHub Pages, the same setup as the Aspire and
  Vulture sites. No server code in Next.js.
- **Supabase** holds all data and logic: tables, security rules and booking functions in
  [`supabase/migrations`](supabase/migrations), three small Edge Functions in
  [`supabase/functions`](supabase/functions). Pricing is decided in the database, never in the browser.
- Health information only ever goes to Supabase, in Canada. Edge Functions are called with region
  `ca-central-1` so they run next to the database. Stripe receives the amount, the booking reference and the
  contact email; no health details.

See [docs/security-and-privacy.md](docs/security-and-privacy.md) for the controls, written to feed the
Privacy Impact Assessment.

## Setting it up

### 1. Supabase project

1. Create an organization (ideally owned by an Aloha email) and a project in **Canada (Central)**. Use the
   **Pro plan** for the live project: free projects have no daily backups and pause when idle.
2. Run [`supabase/migrations/20261019000000_initial_schema.sql`](supabase/migrations/20261019000000_initial_schema.sql)
   in the SQL Editor (or `supabase link` then `supabase db push`).
3. For a demo project only: run [`supabase/seed.sql`](supabase/seed.sql) for fictional clients, nurses and
   bookings. Never load it into the live project.
4. **Authentication → Sign In / Providers**: turn off "Allow new users to sign up". Staff are invited.
5. **Authentication → URL Configuration**: set Site URL to the website and add
   `https://miker888.github.io/aloha-footcare-platform/admin/account/` to the redirect URLs (and
   `http://localhost:3000/admin/account/` for local work).
6. Invite the first admin (**Authentication → Users → Invite**), then in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'owner@alohafootcareservices.ca';
   ```
   After that, roles are managed in the app under Settings.

### 2. Edge Functions

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <project-ref>
supabase functions deploy create-booking
supabase functions deploy stripe-webhook
supabase functions deploy refund-payment
cp supabase/functions/.env.example supabase/functions/.env   # fill it in
supabase secrets set --env-file supabase/functions/.env
```

`supabase/config.toml` turns off the platform's JWT check for these three; each one checks the caller itself.
Until Stripe is connected, `PAYMENTS_MODE=demo` records payments as "Demo" without charging anyone.

### 3. Stripe

1. Create a Stripe account for the clinic (Canada, CAD). Start with test keys.
2. Set `STRIPE_SECRET_KEY` as a function secret. Demo mode switches off automatically.
3. **Developers → Webhooks → Add endpoint**:
   `https://<project-ref>.supabase.co/functions/v1/stripe-webhook?forceFunctionRegion=ca-central-1`
   with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `refund.created`,
   `refund.updated`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. **Settings → Emails**: turn on receipts for successful payments and refunds.

### 4. The website

Put the project URL and **publishable** key in [`.env.production`](.env.production) (both are public by
design) and push to `main`. The workflow runs the checks, builds, and deploys to GitHub Pages
(Settings → Pages → Source: GitHub Actions). GitHub Pages needs a public repo on a free account, or GitHub Pro
for a private one.

Preview: `https://miker888.github.io/aloha-footcare-platform/`. Staff sign in at `/admin/`.

## Working on it

```bash
npm install
cp .env.example .env.local    # point at a demo project
npm run dev                   # http://localhost:3000
npm run lint && npm run typecheck
npm run test:db               # 100+ security and booking tests against a throwaway local Postgres
```

`npm run test:db` needs Postgres 15+ installed locally (not Docker). It loads the migration and the demo
seed, then checks who can see and change what: visitors, signed-in users with no role, admins, nurses and
the Edge Functions' key. The deploy workflow runs it too; nothing deploys if it fails.

Edge Functions are Deno; check them with
`cd supabase/functions && deno check --config deno.json */index.ts`.

Changing the database: add a new file in `supabase/migrations/` (never edit one that has been run), add tests
to `supabase/tests/security_and_booking.sql`, and keep `src/lib/types.ts` in step.

### Where things are

| Path | What |
| --- | --- |
| `src/app/page.tsx` | Homepage |
| `src/app/book/` | Booking form and confirmation |
| `src/app/privacy/` | Collection notice (draft, needs the clinic's privacy officer) |
| `src/app/admin/(staff)/` | Staff screens: dispatch, booking, new booking, clients, nurses, catalog, payments, settings, account, my visits |
| `src/lib/site.ts` | Business details and homepage copy |
| `src/assets/` | The clinic's logo and the palm cut from it. `src/app/icon.png`, `apple-icon.png` and `opengraph-image.png` are made from the same artwork |
| `supabase/migrations/` | Tables, security rules, booking functions |
| `supabase/functions/` | create-booking, stripe-webhook, refund-payment |
| `supabase/tests/` | Database tests |

## Before real client data goes in

- [ ] Privacy Impact Assessment submitted to the OIPC (and accepted) for the new system
- [ ] Information Manager Agreement between Aloha and Virus & Partners Canada; Supabase DPA in place
- [ ] Live Supabase project on the Pro plan, Canada (Central), separate from any demo project
- [ ] Sign-ups off, "Require two-step sign-in" on in Settings, every staff member enrolled
- [ ] Stripe live keys and webhook; receipts on
- [ ] Privacy notice completed (privacy officer, retention period) and reviewed
- [ ] Real prices, products and travel charges entered
- [ ] Domain moved from Wix (keep the MX records so email keeps working)

## Next steps

1. **Vagaro migration**: import clients from Vagaro's export (`clients.external_ref` keeps the Vagaro id).
   Saved cards don't transfer; clients add a card on their first new booking.
2. **Reminders**: email and SMS confirmations and day-before reminders. Needs a provider choice, which goes in
   the PIA.
3. **Facility group days**: one booking for many residents at a residence.
4. **Route planning**: order each nurse's day by distance, run in Canada.
5. **Voice agent and fax intake**: both can write straight into the dispatch queue.
