# Koetsa update package — 7 November 2026

## Included
- Official Koetsa logo applied across the public website and Operations Portal.
- Workforce directory with employee contact and employment information.
- Staff invitation workflow backed by a Supabase Edge Function.
- General Manager and Super Admin workforce administration with protected Super Admin role.
- Existing lead/customer workflow retained; staff lead registration now checks for duplicate phone/email records.
- Track & Trace monthly subscription corrected to M75 and 24-month total M2,600.
- Corrected the baseline subscription-rate trigger SQL and added an additive upgrade migration.

## Important
- This package does not connect to or change your live Supabase project automatically.
- Apply `002_workforce_and_pricing_correction.sql` only after confirming the existing Koetsa tables are present and backing up the project.
- Deploy the `koetsa-invite-staff` Edge Function and set `SUPABASE_SERVICE_ROLE_KEY` as a Supabase secret. Never put that key in website files.
- Existing signed customer agreements are not repriced.
- Keep your existing GitHub Pages `CNAME` and existing public Supabase configuration files when copying the update into your local repository.
