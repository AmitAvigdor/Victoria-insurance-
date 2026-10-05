# ויקטוריה — Verification record

Updated 5 October 2026. The local frontend is connected to Supabase project `hnrvswoxppipwwrpanwp`.

## Vehicle workbook adaptation — pending production approval

- Exact provided headers are detected. Missing IDs, phones and policy numbers are not fabricated. Compulsory/comprehensive coverage, registration, commission and unnamed extra-column values are preserved. Annual premium is left unknown rather than inferred from ambiguous source values.
- Customers are not merged by name: preview supports an explicit existing-customer or prior-row link. Persistent import keys protect sequential/partial-write retries. Existing records are not overwritten.
- 37 unit tests passed, including 8 new vehicle cases. 46 PostgreSQL/RLS checks passed, including applying the migration to populated tables, blank-value support, nonblank uniqueness, duplicate import keys and tenant isolation.
- All 10 applicable demo browser scenarios passed across desktop and iPhone-sized Chrome (8 in the full run, then the 2 new vehicle scenarios after fixing test locators and the notes accessibility label). Two hosted-only cases are intentionally excluded from demo mode. Vehicle checks exercise auto mapping, explicit grouping, saving/retry, complete original notes and raw values, search by registration, editing and reload persistence.
- TypeScript, ESLint and production build passed. Supabase dry run reports only `202610050001_vehicle_import.sql` pending. Automatic approval review rejected the production apply because it changes production constraints and requires explicit approval. No remote migration or frontend deployment for this adaptation has occurred.
- An additional isolated hosted integration check is prepared but cannot run until the migration is approved/applied. No actual customer workbook has been imported.

## Excel import addition — 5 October 2026

- Added `/import`, navigation and customer-page entry points; XLSX/XLS/UTF-8 CSV parsing in a worker, sheet/header selection, Hebrew/English column mapping, explicit preview/approval, row reports and retry.
- Supports customers, combined customer/policy rows, policies for existing customers, and tasks for existing customers. Unknown columns can be preserved in notes. Existing records are skipped, not updated; attachments are excluded. No schema/RLS changes.
- 29 unit tests passed (22 importer tests, 7 existing tests). Import checks cover both Excel formats, CSV Hebrew and day-first dates, 1904/1900 date systems, raw premium precision, malformed data, formulas, duplicate ownership, extra fields, stale previews, cancellation and recovery after a partial save.
- Full demo browser suite: 8 passed, 2 hosted-only agency tests intentionally skipped. Desktop Chrome and an iPhone-sized Chrome viewport cover mapping, multi-sheet/header choice, preview, linked saves, persistence, duplicate retry, report download, invalid input and the existing application workflows. The mobile importer checks were rerun after the responsive row layout change.
- TypeScript, ESLint, formatting and production build passed. Existing Zod annotation warnings remain non-blocking. No real customer workbook was supplied or imported, and hosted writes were not repeated for this feature.

The following sections record the earlier baseline verification, before this import feature and the Vercel deployment.

## Changes made during this verification

- Renamed the product to **ויקטוריה** in the login, password reset, navigation, footer, browser title, description and package metadata.
- Fixed mobile RTL table overflow with containment on the table scroller. Before the fix, the renewals page expanded the mobile layout and its date filters could not be clicked.
- Updated the provisioning SQL to the user's replacement Auth UUID.
- Isolated Playwright's demo/live servers, Vite caches and test output from one another and from the regular development server.
- Extended browser checks to cover document deletion, all main routes' viewport bounds, and switching between real Supabase agencies.
- Added repeatable hosted API and password-recovery verification scripts.

## Local checks

| Check                                    | Result                                                           |
| ---------------------------------------- | ---------------------------------------------------------------- |
| TypeScript                               | Passed                                                           |
| ESLint                                   | Passed                                                           |
| Unit tests                               | 7 passed                                                         |
| PostgreSQL/RLS migration tests on PGlite | 41 passed                                                        |
| Production build                         | Passed                                                           |
| Demo browser tests                       | 4 passed: desktop/mobile workflow and responsive routes          |
| Hosted browser tests                     | 3 passed: complete workflow, agency switching, responsive routes |
| Password recovery                        | Invalid link, real redirect and password change passed           |

The two agency-switching cases in the demo run are intentionally skipped: that test requires real hosted accounts and runs in the hosted suite. Desktop/mobile tests use installed Chrome; the mobile configuration emulates an iPhone viewport and touch input. This is not a physical-device Safari test.

The build emits two annotation warnings from the installed Zod dependency and completes successfully.

## Hosted checks

`scripts/test-hosted.mjs` uses two temporary agencies, two colleagues in the first agency, a user in the second agency and an unprovisioned user. It verifies:

- Correct-password login, wrong-password rejection and session persistence after reload.
- Same-agency customer access and edits shared between colleagues.
- REST isolation for agencies, profiles, customers, policies, tasks, documents and activities. Both agencies have populated fixtures before isolation assertions.
- Rejected cross-agency customer writes, membership changes and policy/customer links.
- Denied anonymous access and no customer visibility for an unprovisioned account.
- Policy edits, task completion, customer archive/restore and transactional audit records.
- Private Storage bucket and configured 10 MiB limit.
- Private PDF upload, signed view, exact downloaded bytes and download filename.
- Same-agency document access and rejected foreign listing, signing, download, upload and deletion attempts.
- Rejected file overwrite.
- Signed URL rejection after its 60-second validity period.
- Document deletion removes both metadata and the stored object.
- Browser workflow: customer → policy → seven-day renewal → task completion → activity → document upload → reload → download → deletion → logout → protected-route rejection.
- Logging into a second agency in the same browser never reveals the first agency's customer; a direct link and reload show “הלקוח לא נמצא”.

The suite has 20 named hosted checks, including the three browser scenarios. Test fixtures are removed in `finally`, including Storage objects, business records, profiles, agencies and Auth users. Existing customer records and the user's password are not modified.

## Password recovery

`scripts/test-recovery.mjs` creates a temporary Auth account and uses an administrator-generated recovery link without sending email. It confirms:

1. An invalid link disables password submission.
2. Supabase redirects a valid recovery link to `http://127.0.0.1:5173/reset-password`.
3. Mismatched passwords are rejected; matching passwords update successfully and return to login.
4. The old password stops working and the new password authenticates.

The temporary account is removed afterward. Actual email delivery and email-provider rate limits were not retested.

## Limits and operational notes

- A previously downloaded response can remain in a cache after deletion. The deletion check verifies the Storage listing and a fresh authenticated request to distinguish this from an object that remains stored. Already downloaded copies cannot be recalled.
- The frontend is still local. Production hosting, HTTPS, production recovery URLs and deployed SPA routing have not been configured or verified.
- Agency and agent display names retain the configured values; changing the application's name does not change agency membership or customer data.
- Existing internal demo database/session keys are preserved so the rename does not discard local demo data.
- The applied initial migration was not rewritten or reapplied.

See `README.md` for commands to rerun the suites. Hosted tests require explicit opt-in and an authenticated administrator CLI. Credentials remain in process memory; hosted browser tracing is disabled.
