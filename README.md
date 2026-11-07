# Koetsa Tracking Systems — public website + operations portal

This package keeps the existing static public website separate from the private staff portal. The public site remains under the root folder; the staff portal is under `/portal/`; the Supabase database setup is under `/supabase/migrations/`.

## What is included

### Public website
- Existing company pages and branding, plus the agreed four package tiers and 24-month calculator.
- Customer application form. Once Supabase is configured, the form submits a validated application to the database and then opens a WhatsApp hand-off. Until configured, it remains a WhatsApp-only enquiry and clearly says that it has not been saved.

### Private operations portal (`/portal/`)
- Individual staff sign-in using Supabase Auth (no public staff registration screen).
- Role-aware staff access: Super Admin, General Manager, Sales Manager, Sales Consultant, Office Administrator, Technical Manager, Installer and Finance Officer.
- Overview dashboard, lead pipeline, lead stage changes, lead assignment, customer register, vehicle register, installation jobs, subscriptions, payment ledger and staff access administration.
- Sales staff can register leads from walk-ins, phone calls and referrals; sales consultants see leads they created or were assigned.
- Installation records include customer/vehicle, IMEI, SIM, installer, test outcome and certificate number.
- Subscription records preserve the 24-month contract, payment option and package-specific setup/monthly values. Payment records are manual ledger entries; no money is collected by this website.

## Agreed package rates (Maloti)

| Package | Once-off installation + admin | Monthly | 24-month total |
|---|---:|---:|---:|
| M1500 — Track & Trace | M800 | M99 | M3,176 |
| M2500 — Security & Control | M1,200 | M120 | M4,080 |
| M3000 — Fleet & Driver Intelligence | M1,300 | M130 | M4,420 |
| M3500 — Premium Recovery & Response | M1,500 | M150 | M5,100 |

Both payment options retain the same benefits and features. The monthly option is the once-off fee followed by 24 monthly payments; the upfront option is the full once-off fee plus all 24 monthly payments. No discount is applied.

## Setup required before live use

1. **Existing Supabase project:** the Koetsa database migration was already executed successfully. Do not run it again on the existing project. The corrected migration is retained under `supabase/migrations/` for version history and for a separate, newly provisioned environment.
2. The supplied `portal/config.js` and `assets/js/public-config.js` contain the Koetsa project URL and browser-safe publishable key. Never replace these with a service-role key or database password.
3. Deploy the contents of this folder to the root of the existing GitHub Pages repository. Preserve the `CNAME` file and publish from the same branch/folder already configured in GitHub Pages. The staff portal will be at `/portal/`.
4. In Supabase Authentication settings, disable public user sign-ups. Staff must be invited by an administrator.
5. Invite the first administrator through Supabase Authentication. The auth trigger creates an inactive profile with the least-privileged default role `sales_consultant`.
6. Activate and promote that first account to Super Admin in Supabase SQL Editor using its Auth user UUID:

   ```sql
   update public.profiles
   set role = 'super_admin', is_active = true, full_name = 'Koetsa System Administrator'
   where id = 'AUTH-USER-UUID-HERE';
   ```

7. Sign in at `/portal/`. A Super Admin can activate invited staff and manage their roles in Staff & Access.
8. Test separate accounts for each role before entering real customer records. Confirm the portal is accessed only over HTTPS.

## Security model and important limits

- Supabase Row Level Security is enabled on all business tables. The public website receives no direct table read/write permissions; it can only call the validated `submit_koetsa_application` function.
- Never put a Supabase service-role key in `config.js`, any browser JavaScript, GitHub, or a public repository. Only the publishable/anon key belongs in browser config.
- Elevated roles cannot be self-assigned. Only an existing Super Admin can change staff roles through the protected database function; initial bootstrap is performed by the project owner in SQL Editor.
- Audit logs record table, row ID, action and changed field names, not the values of sensitive fields.
- Before production, add CAPTCHA/bot protection and rate limiting to the public application endpoint, configure backups and alerting, review privacy/consent wording under Lesotho law, and conduct an independent security review. The SQL function has input validation but is not a substitute for abuse protection.
- This is an operations/CRM foundation, not a live GPS map integration. Device telemetry, remote commands, automated subscription billing, payment gateway, customer self-service accounts, certificate PDF generation, WhatsApp Business API inbox and CRM synchronisation require their own approved integrations and credentials.
- Payment records are entered manually. The portal does not process card/mobile-money payments and does not automatically suspend tracking for overdue accounts.
- Remote listen-in, immobilisation, law-enforcement escalation and recovery services must only be used where lawful, technically supported, consented to and covered by written operational agreements.

## Development note

This is a static front end backed by Supabase Auth/Postgres/RLS. The Supabase project must be configured and deployed before sign-in or persistent application storage works. No credentials, staff accounts or customer data are included in this package.
