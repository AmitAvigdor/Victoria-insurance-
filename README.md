# ויקטוריה · Victoria Insurance Agency CRM

A Hebrew, RTL insurance-agency MVP built with React, TypeScript, Vite, Tailwind CSS, shadcn/ui-style Radix primitives, Supabase Auth, PostgreSQL and private Supabase Storage. Original implementation; no BAFI code, assets, integration, or AI features. No paid service is required by the code.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Without Supabase configuration, choose **כניסה לסביבת הדגמה** on the login page. The fictional sandbox stores records and uploaded files in IndexedDB on this device, with a tab-local demo session. It is separate from Supabase, is labeled throughout, and must never contain real personal data. It is enabled during development only, unless `VITE_ENABLE_DEMO=true` is explicitly set at build time. Configured Supabase always takes precedence; connection failures never fall back to demo data.

The application remains usable without any cloud credentials in demo mode. Real authentication, shared records and private cloud documents require the configuration below. Demo data is not migrated automatically to Supabase.

## Supabase setup

1. Create a Supabase development project (the free tier is sufficient for initial development).
2. Run `supabase/migrations/202610040001_initial.sql` in the Supabase SQL Editor. It is a **one-time**, transactional migration, not an idempotent setup script. For subsequent schema changes, add new migrations instead of editing applied migrations.
3. In **Authentication → Users**, create/invite an email/password user. Ensure the email is confirmed. There is deliberately no public self-service signup or browser-controlled agency assignment.
4. Edit `supabase/provision-agency.sql`: set the Auth user's UUID (the current development user's UUID is already filled in), and choose your agency name, agent name and a unique agency UUID. Run the transaction as a trusted administrator. To add another team member, insert another `profiles` row referencing the same agency. To create another agency, use a different agency UUID. No service-role key belongs in this application.
5. Copy `.env.example` to `.env` and fill in the project URL and **public publishable key** (or legacy anon key):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
VITE_ENABLE_DEMO=false
```

6. In Supabase Auth URL configuration, use your development/production origin as the site URL and allow only the redirect URLs you use. Disable open signups if your project also exposes the signup endpoint to other clients.
7. Restart `npm run dev`. Sign in with the provisioned user's email and password.

All `VITE_*` values are included in the client bundle; **never** put service-role credentials, provider API secrets or database passwords in them. `.env` and variants are ignored by Git, with `.env.example` as the only exception.

### Running migrations with the CLI

The SQL Editor works without Docker. Alternatively, install/use the official Supabase CLI, initialize its local configuration once, and link your project:

```sh
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Run migrations with either the SQL Editor or CLI, not both against the same database without reconciling migration history. For a fully local Supabase stack, Docker and `npx supabase start` are required; then apply the migration to that stack and use its local API URL/public anon key. The frontend itself always runs locally via Vite.

### Optional fictional data

Edit the agency UUID in `supabase/seed.sql` to match your **development** agency, then run that script in the SQL Editor after provisioning. The seed includes fictional Hebrew names, zero-prefixed dummy identifiers/phones, reserved `example.invalid` email addresses, policies relative to the seed date and tasks. The script is transactional and can be rerun for that agency without duplicating policies/tasks. Do not load demo data into a real customer database.

The browser demo seed is in `src/services/demo-seed.ts`. Its dates are relative to first use; existing saved demo records are preserved across reloads. Clearing this site's IndexedDB resets the fictional sandbox.

## Features

- Email/password login, persisted Supabase sessions, protected routes, user menu and logout.
- Dashboard counts computed from fetched database records, upcoming renewals, open/overdue tasks.
- Customers: create, search by name/phone/email/identification number, edit, archive and restore.
- Customer profiles: contact details, policies, documents, tasks and activity tabs.
- Policies: create/edit, customer linkage, all requested insurance types/statuses, annual premium in ILS, search and filters.
- Renewals: date-based 7/30/60/90-day and expired filters; customer and phone links. Canceled policies are excluded. The renewal window is independent of manually recorded policy status.
- Tasks: optional customer/policy links, priorities, status filters, overdue filter, completion/reopening.
- Documents: customer/policy links, upload, view, download and confirmed deletion. PDF, JPG, PNG and DOCX; 10 MiB maximum. No public bucket URLs.
- Database-generated audit events for customer/policy/task/document changes, including archive and deletion.
- Responsive RTL layout, local Hebrew font assets, accessible labels, keyboard-focused dialogs, feedback toasts, loading, error and empty states, and paginated tables.

Active dashboard policies are non-canceled/non-ended policies whose coverage dates include today. Archived customers are excluded from the customer total; their policies, renewals and pending tasks remain visible so obligations are not silently lost. Date-only calculations use the **Asia/Jerusalem** calendar and UTC calendar arithmetic to avoid daylight-saving errors. Premium means **annual premium**, not a monthly or commission estimate.

## Architecture

```text
src/app/                  App routes, Auth/session provider, scoped query cache
src/pages/                Hebrew business screens
src/components/           Shared layout, editors, record lists and state views
src/components/ui/        Owned shadcn/ui-style Button and Radix Dialog primitives
src/domain/               Record types, Zod validation, dates and business selectors
src/services/repository.ts Persistence contract used by UI
src/services/supabase.ts   Supabase database/storage adapter
src/services/demo.ts       Explicit fictional sandbox adapter (IndexedDB)
src/services/integrations/ Future server-side provider boundary
src/lib/                  Supabase initialization and common utilities
supabase/migrations/      PostgreSQL tables, constraints, indexes, RLS, audit, bucket
supabase/seed.sql          Optional fictional database seed
supabase/provision-agency.sql Trusted administrator provisioning template
scripts/test-security.mjs Executable PostgreSQL/RLS regression tests with PGlite
```

TanStack Query scopes cache keys to the user and agency; writes invalidate queries, and logout clears cached data. Repository reads use ordered batches to avoid Supabase's default row cap. For a larger deployment, replace the full agency snapshot with server-side pagination/search, indexed search and aggregate RPCs. All screens already depend on the service boundary, not directly on a provider.

For BAFI or other insurance providers, implement an adapter **server-side**, authenticate the actor/agency, validate mapped domain inputs, and call permitted data operations. Keep provider tokens server-side. No placeholder integration buttons or background integrations are included. AI, extraction, email, WhatsApp, notifications and reports are intentionally not implemented.

## Security model

- RLS enabled on all seven application tables; explicit per-command policies; anonymous users have no application-table privileges.
- `current_agency_id()` derives membership from a protected `profiles` table and `auth.uid()`, not from client-supplied claims or editable user metadata. Its security-definer function has an empty search path and limited execution privileges.
- Every business row has `agency_id`. Composite foreign keys prevent cross-agency relationships **and** a task/document linking to a policy belonging to a different customer within the same agency.
- Row UUIDs, agency IDs and policy customer ownership cannot change. Profiles and agencies can only be provisioned administratively. All agents in one agency have the same permissions in this MVP.
- Input validation is enforced in the client and important constraints are independently enforced by PostgreSQL. Browser checks are not the security boundary.
- Audit records are created by database triggers in the original transaction. Browser roles cannot forge, edit or erase them. There is no hard-delete privilege for customers, policies or tasks; customer removal is reversible archival.
- Storage is private, restricted by agency folder, customer association and file path. Bucket MIME/size restrictions are enforced by Supabase; overwrite is disabled. Metadata paths are checked against agency, customer, document UUID and MIME extension.
- Document URLs expire after 60 seconds. Anyone given a still-valid signed URL can use it until expiry; treat these URLs as sensitive. Signed URLs already issued are not revoked by logout.
- Previously downloaded responses may remain cached after document deletion. Deletion removes the stored object and metadata; it cannot recall copies already downloaded. Hosted deletion tests verify both the storage listing and a fresh uncached request.
- Upload metadata failure attempts to remove uploaded bytes. Storage and PostgreSQL are separate transactions: a cleanup failure reports that manual cleanup is needed. Deletion removes bytes first, then metadata; retry a metadata deletion failure. Administrative periodic orphan cleanup is a future operational task.
- Auth sessions are persisted by the Supabase SDK in browser storage. Shared devices should use logout. Production requires HTTPS, appropriate deployment headers/CSP, least-privilege operator access, backups, retention rules and a review appropriate to the agency's real data. No compliance certification is implied.
- File MIME and size checks are not malware scanning or content inspection. Add a quarantine/scanning pipeline before expanding file types or accepting arbitrary public uploads.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:security
npm run build
npm run preview
```

The security suite runs the actual migration on embedded PostgreSQL via PGlite, with lightweight stand-ins for Supabase's `auth`/`storage` schemas. It exercises tenant isolation, immutable membership, cross-tenant and wrong-customer references, protected audit, document paths, private bucket configuration, anonymous access and legitimate writes. It does **not** emulate the hosted Auth HTTP API or Storage byte service.

See `VERIFICATION.md` for the checks performed in this environment and remaining hosted integration checks. After connecting a development Supabase project, repeat the checklist with two agencies and two authenticated accounts. Do not treat demo authentication or simulated schema tests as a substitute for a hosted integration test.

## Production build

`npm run build` outputs `dist/`. Serve it over HTTPS with a single-page-app fallback (`/*` → `/index.html`). Configure the public Supabase variables **at build time**. Never enable `VITE_ENABLE_DEMO` for a real agency deployment. Missing configuration in production produces a setup message with login disabled, not an insecure automatic login.

The frontend runs locally and is connected to the user's Supabase project. Hosted verification creates isolated fictional agencies/accounts and removes them afterward. Production frontend hosting has not been deployed or verified.

## iPhone web app

Victoria includes the PWA files needed for iPhone home-screen use:

- `public/manifest.webmanifest` with the Hebrew app name, RTL language metadata and standalone display mode.
- `public/apple-touch-icon.png` and PNG app icons for home-screen installation.
- `public/sw.js` for the application shell. It does not cache Supabase API calls or private document URLs.

To install it on an iPhone, deploy the production build to a real HTTPS URL, open that URL in Safari, tap **Share**, then choose **Add to Home Screen**. Update Supabase Auth URL configuration to use the production URL as the site URL and add the reset-password redirect URL, for example `https://your-domain.example/reset-password`.

### Vercel deployment

Create a new Vercel project for this app, or add this folder as a separate project in an existing Vercel account. Use these settings:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ENABLE_DEMO=false`

The included `vercel.json` rewrites all application routes to `index.html`, so direct visits and refreshes on routes such as `/customers`, `/renewals` and `/reset-password` work in production.

After deployment, set the production Vercel URL in Supabase Auth:

- Site URL: your Vercel production URL or custom domain
- Redirect URL: `https://your-domain.example/reset-password`

## References

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [shadcn/ui manual installation](https://ui.shadcn.com/docs/installation/manual)

### Excel import

#### Vehicle workbook matching the agency's existing columns

The importer recognizes **שם המבוטח, חברת הביטוח, תחילת הביטוח, סיום הביטוח, חובה, מקיף, מס׳ רישוי, עמלה, הערות**, including nonbreaking spaces and trailing punctuation, and selects the vehicle mode automatically. One source row becomes one vehicle-insurance record with separate compulsory/comprehensive source-value fields. Missing identity, phone and policy number remain empty; an unknown annual premium remains `null`, displayed as **לא צוין**. Coverage and commission values remain text exactly as displayed in Excel; their meaning is not inferred and no sum/percentage conversion is performed. Unnamed extra columns are preserved in insurance notes by default.

Vehicle registration, customer name, insurer and valid start/end dates are required. Rows without a usable registration are reported for correction. Imported customers are not merged on name alone. The preview defaults to a new customer for each distinct vehicle row; users can explicitly choose an existing customer or a prior source row. Prior-row links are revalidated, and archived/missing customers are blocked. The internal source key uses normalized name, insurer, coverage dates and registration. Unique agency-scoped import keys on customers and policies prevent duplicate retry, including a customer saved before a policy failure. Existing source rows are skipped, even if the coverage values changed; editing is done in the policy form. Matching by the composite source key cannot distinguish different people with identical names insuring the same car in the same period; these rows require manual review.

Policy forms and list details show registration, compulsory/comprehensive values and commission; policy search includes registration. Blank contact details have explicit missing-value labels.

Requires `supabase/migrations/202610050001_vehicle_import.sql` **before deploying this frontend**. It adds source/vehicle fields, allows blank surnames/identity/phone/policy number and nullable premiums, and replaces the identity/policy-number unique constraints with indexes for nonempty values. It adds unique agency-scoped import-key indexes. Existing values, RLS, audit triggers and cross-agency foreign keys remain in place. Production migration execution is pending explicit approval after automatic approval review rejected the first apply attempt; the dry run and local PostgreSQL migration tests succeeded.

#### Standard import modes

Open **ייבוא מאקסל** in the navigation, or **לקוחות → ייבוא מאקסל**. Choose an `.xlsx`, `.xls`, or UTF-8 `.csv` file (up to 10 MB). Select a sheet, its header row, and the import mode: customers, combined customer/policy rows, policies for existing customers, or tasks for existing customers. Each run imports one sheet, up to 10,000 data rows and 100 columns. Import customer sheets before separate policy/task sheets.

Hebrew and English headers are suggested automatically and can be remapped. Standard customer imports require first name (or a full name split at its first space) and identification number; surname and phone can be completed later. Standard policy imports require company, policy number, supported insurance type, start/end date and annual premium; tasks require title and due date. Dates accept Excel dates, `DD/MM/YYYY`, `DD.MM.YYYY`, `DD-MM-YYYY`, or `YYYY-MM-DD`. Short digit-only identity numbers are padded to nine digits; phone zero restoration is highlighted for review. Numeric premiums use the underlying cell value, not rounded display text; decimal commas and more than two decimal places require correction.

Unmapped columns are preserved by default in the new customer's notes, policy notes in policy-only mode, or task description in task mode. Notes are limited to 5,000 characters; overflow is reported without truncation. Embedded images, attachments, and document binaries are not imported. Formulas are not executed: saved cell values are used and missing/error values are flagged.

Review each row, expand **הנתונים שיישמרו**, and explicitly confirm before saving. Existing records are never overwritten. Standard imports match customers by agency-scoped identification number, policies by company and policy number, and tasks by customer/title/due date. Duplicate customer details and notes are explicitly skipped; differing new-customer rows with the same identity are flagged. Rows with errors are skipped only after the user confirms the displayed count. Saves use the validated repository and existing RLS policies; no privileged key is used in the application.

The parser runs in a worker on the device; no workbook is uploaded to a parsing service. Inserts are sequential, not one database transaction. A failure stops further writes, records any already-created customer, and shows a per-row result. The user can stop after the current row and download a CSV report. Retry by generating a fresh preview of the same sheet; existing customer/policy keys are skipped. Avoid concurrent imports of the same task file (tasks have no database uniqueness constraint). Preview is rechecked against fresh data immediately before saving. A browser/network interruption with uncertain acknowledgement requires reviewing the fresh preview before retrying.

Parser dependency: [SheetJS CE official installation documentation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), pinned tarball `0.20.3` with lockfile integrity.

### Optional automated browser rerun

The included Playwright suite starts its own server on port 5175 with Supabase disabled, so it uses fictional demo data even when `.env` configures the main application:

```sh
npx playwright install chromium
npm run test:e2e
```

It covers the end-to-end customer/policy/renewal/task/document flow, reload persistence, logout protection, download and mobile/desktop document bounds. Each test gets an isolated browser context. The fixture in `tests/responsive.html` is available during development for a 390-pixel manual check, but is excluded from the production bundle.

If Chrome is installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses it without a separate browser download. Test servers use separate Vite cache directories from the user's development server.

### Hosted verification

With the Supabase CLI logged in as the project administrator, run:

```sh
CONFIRM_HOSTED_TEST=true PLAYWRIGHT_CHANNEL=chrome npm run test:hosted
CONFIRM_HOSTED_TEST=true PLAYWRIGHT_CHANNEL=chrome npm run test:recovery
```

Set `SUPABASE_CLI` to the CLI executable path if it is not on PATH. The hosted suite starts its own frontend on port 5176, creates two temporary agencies and four users, tests REST/Storage permissions and the browser workflow, then removes the fixtures. The recovery suite expects the regular app on port 5173 (override with `HOSTED_APP_URL`), creates one temporary user, and tests a generated recovery link and password change without sending email. Administrator keys and passwords stay in process memory. Hosted browser traces are disabled to avoid recording credentials.

The public product name is **ויקטוריה**. Existing IndexedDB/session keys retain their original internal names so the rename preserves saved demo data and sessions.
