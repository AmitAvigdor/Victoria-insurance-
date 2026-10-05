# ויקטוריה — Verification record

Updated 5 October 2026. The local frontend is connected to Supabase project `hnrvswoxppipwwrpanwp`.

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
