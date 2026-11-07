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
| M1500 — Track & Trace | M800 | M75 | M2,600 |
| M2500 — Security & Control | M1,200 | M120 | M4,080 |
| M3000 — Fleet & Driver Intelligence | M1,300 | M130 | M4,420 |
| M3500 — Premium Recovery & Response | M1,500 | M150 | M5,100 |

The upfront option is the once-off package price and does not include ongoing Koetsa Operations Centre monitoring or coordinated SOS response. The monthly option is the installation/admin fee followed by 24 monthly service payments and includes the ongoing subscription benefits while the account is active.

## Setup required before live use

1. **Existing Supabase project:** do not rerun the original migration on the existing project. Apply only the new additive migration `002_workforce_and_pricing_correction.sql` as described below.
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

7. Sign in at `/portal/`. The Super Admin and General Manager can invite staff, update employment details and activate/suspend staff in Staff & Workforce. Only a Super Admin can create or modify another Super Admin.
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


## Workforce portal upgrade (November 2026)

The update adds:
- Official Koetsa logo to the public site and staff portal.
- Staff directory with contact details, department, job title and employment start date.
- In-portal employee invitations by email. New accounts are created inactive and must be activated by management.
- General Manager and Super Admin staff administration. A General Manager cannot create, edit, demote or suspend a Super Admin; only a Super Admin can do that.
- Existing employee lead registration remains available. Sales staff can submit their own leads; the existing database access rules limit their view to leads they created or were assigned.
- Super Admin and General Manager retain company-wide visibility of leads and customer records.
- Correct Track & Trace subscription rate of M75/month and M2,600 total over 24 months. The other package rates remain unchanged.
- Duplicate phone/email check when a staff member submits a new lead. If a customer already exists, the employee is directed to management rather than creating a duplicate.

### Apply the database update safely

1. Make a backup of the Supabase project before changing the database.
2. Open Supabase → SQL Editor.
3. Open `supabase/migrations/002_workforce_and_pricing_correction.sql` from this package, copy its complete contents into a new SQL query, and run it once.
4. Do not run `001_koetsa_operations.sql` again on the existing project. Migration 002 is an additive correction and does not delete customer, lead, vehicle, subscription or payment records.
5. New Track & Trace monthly subscriptions use M75. This migration does not rewrite historical subscription rows or existing signed agreements.

### Enable staff invitations

The invitation feature uses a Supabase Edge Function. Its service-role key stays on Supabase's server and is never added to `portal/config.js`, `assets/js/public-config.js`, or GitHub.

On Ubuntu, after installing the Supabase CLI and authenticating:

```bash
supabase login
supabase link --project-ref gmpykbgjwbhpqyqhsvoj
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase functions deploy koetsa-invite-staff
```

Get the service-role key from Supabase Project Settings → API Keys / API. Do not paste it into ChatGPT, a website file, GitHub, or a screenshot. Paste it only into the terminal command when setting the Supabase secret. If your Supabase dashboard provides a function secret editor, you may set the same secret there instead.

The function checks the signed-in caller against the active staff profile. Only the Super Admin and General Manager can invite employees. The server sends the invitation email and creates an inactive staff profile. The employee sets their own password from the invitation email.

### Publish the website and portal

1. Copy the updated website and portal files from this package into your local GitHub repository, keeping the existing `CNAME` file and `portal/config.js`.
2. Commit and push the changes to the branch already used by GitHub Pages.
3. Wait for the GitHub Pages deployment action to finish.
4. Test the website and `/portal/` over HTTPS.
5. Sign in as Super Admin or General Manager, open Staff & Workforce, and invite one test employee before inviting the rest of the team.
6. Confirm the invitation email arrives, the employee can set a password, and management can activate the profile.
7. Sign in as the test employee and register a test lead. Confirm that the employee sees their own lead and management can see the same lead and linked customer.
8. Test suspension: deactivate the test employee and confirm they can no longer enter the portal.

### Important operational notes

- Existing profile, customer and lead data is preserved.
- Existing signed contracts should not be repriced retroactively. The M75 rate applies to new Track & Trace subscriptions after the migration.
- A manager should verify the employee's invitation acceptance before activating the profile.
- The portal does not yet store uploaded identity documents or attachments. This release covers employee accounts and structured lead/customer data entry; secure document uploads should be added as a separate storage feature with file-type, size and access controls.
- The invitation function sends Supabase Auth invitation emails. Configure the project's SMTP/email templates and allowed redirect URLs in Supabase Authentication settings before production use.
