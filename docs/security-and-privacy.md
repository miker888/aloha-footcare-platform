# Security and privacy controls

Written as input for Aloha Footcare's Privacy Impact Assessment under Alberta's Health Information Act, and
for the information manager's security policy. It describes what the system does today; anything still to
be decided is listed at the end.

## What health information the system holds

| Where | What |
| --- | --- |
| `clients.care_notes` | Health details staff record for ongoing care (e.g. diabetes, blood thinners) |
| `bookings.concerns` | What the client asked for help with (from a fixed list) |
| `bookings.client_notes` | Free-text note from the client |
| `bookings.visit_notes` | Short scheduling note from the nurse after a visit (not clinical charting) |
| `bookings.insurance` | Whether the client has coverage, and which kind |

Identifying information sits alongside it: names, addresses, phone numbers, email, visit dates and the nurse
who visited. Payment records hold amounts and Stripe ids, never card numbers.

## Where it is stored and processed

- **Database, authentication and Edge Functions**: Supabase, project in AWS Canada (Central), ca-central-1.
  Edge Functions are invoked with region `ca-central-1` (the browser sets `x-region`; the Stripe webhook URL
  carries `forceFunctionRegion=ca-central-1`).
- Supabase processes limited data outside the region (account and billing information about the clinic's
  Supabase account, and support access) under its DPA and standard contractual clauses. This needs to be named
  in the PIA.
- **Website files**: GitHub Pages. Static files only; no client information passes through or is stored there.
  Forms send directly from the browser to Supabase over HTTPS.
- **Card payments**: Stripe (US). Stripe receives the amount, the booking reference ("AL-1042") and the
  contact's email. It never receives health information. Card numbers go straight to Stripe's hosted page.

## Who can see what

Enforced in the database with Row Level Security, so it holds no matter which screen or tool is used.

| | Visitors | Signed in, no role | Nurse | Admin |
| --- | --- | --- | --- | --- |
| Online services, prices, areas | Read | Read | Read | Read and edit |
| Clients | None | None | Only clients on their own assigned visits | All |
| Bookings | None (create through the booking function only) | None | Only their own assigned visits | All |
| Payments | None | None | None | Read; record non-card payments and refunds |
| Audit log | None | None | None | Read |
| Staff roles | None | Own profile only | Own profile only | Manage |

- New accounts start with no access. Public sign-up is turned off; staff are invited.
- A nurse can only mark their own visit completed or a no-show (through a database function), nothing else.
- Prices and totals on a booking can't be changed directly; they come from the catalog at booking time.
- The last active admin can't remove their own access.
- When **Require two-step sign-in** is on, a password-only session sees nothing; the rule lives in the same
  database check as the roles. An admin can only turn it on after signing in with a code themselves.
- The online booking function (secret key) is the only way the public can create records. It validates every
  field, limits repeat requests from one phone number and overall volume, and rejects forms filled in by bots.

## Audit trail

- Every insert, update and delete on clients, bookings, booking items, payments, nurses, catalog, areas,
  settings and staff profiles is logged with who, when, which record and which fields changed. Field values
  are not copied into the log, so the log holds no health information.
- Opening a booking or client record logs a "view" entry for that staff member.
- Payments and the audit log are append-only. A database trigger blocks edits and deletes for every role the
  application uses, including the Edge Functions' secret key. Corrections are new rows.

## In transit and at rest

- HTTPS everywhere (GitHub Pages, Supabase, Stripe).
- Supabase encrypts the database and backups at rest.
- Backups: daily, kept 7 days, on Supabase Pro. Point-in-time recovery is available as an add-on.

## Retention and disposal

Records are never deleted by the application. Retention and disposal follow the clinic's records policy; the
period still needs to be set (see the privacy notice placeholder).

## Breach response

To be written into the clinic's privacy policy: who decides, notifying the OIPC, the Minister and affected
individuals as the HIA requires. The audit log supports working out what was accessed.

## Still to decide

1. Retention period for client and booking records.
2. Whether clinical charting moves into this system (not built) or stays elsewhere.
3. The email/SMS provider for reminders, and its data residency.
4. Who at the clinic is the privacy officer.
