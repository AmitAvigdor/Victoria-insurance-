# Victoria improvements — 7 October 2026

## Workflows

- Renewal stages, next follow-up and notes; existing policy dates and coverage status remain separate from the handling outcome.
- Completed/declined handling stays available through the stage filter, while open-renewal counts and the daily queue exclude it.
- Daily queue shows due/overdue follow-ups, renewals within seven days with no follow-up booked, and due/overdue tasks.
- Mobile renewal cards with call, manually opened WhatsApp and a contact-note form. No messages are sent automatically. International numbers are normalized before opening WhatsApp.
- Contact notes and workflow changes are recorded in the server-generated customer history with the authenticated actor.
- Commission report uses explicitly entered shekel amounts and an entitlement date. Original spreadsheet commission strings remain unchanged; percentages are not automatically calculated. Received amounts are cumulative totals, grouped by entitlement month, not a receipt-date ledger.
- General search covers customer identifiers and related policies, normalizes formatted phone/vehicle numbers, and is accessible from the mobile menu. Search text does not enter the URL.

## Reviewed spreadsheet updates

Updates are opt-in. Preview lists previous/new values and requires each changed field to be checked. An explicitly checked empty value clears that field. Unmapped and unselected fields stay unchanged. Customer identity and policy ownership cannot be changed through import.

Customers match by ID number. Policies match by insurer/policy number, or their existing vehicle import key. A changed end date in a vehicle sheet can be linked manually to an existing policy with matching vehicle, insurer and start date; a new start date remains a new insurance period. Identical customer names are never merged automatically; the existing manual customer linkage remains available.

The import reloads and compares the reviewed plan before execution. The server then locks each reviewed row and compares its timestamp, whitelists fields, enforces constraints and commits a row's selected customer/policy changes atomically. Selecting updates to the same record from multiple spreadsheet rows is rejected. Import creation and multiple spreadsheet rows remain individually committed, as before; the result report identifies partial outcomes and stops after errors.

## Business-data backup

`npm run backup` creates an AES-256-GCM encrypted archive of agency/profile/customer/policy/task/document/activity records and **all** files in the private document bucket, including archived documents and unreferenced files. A second read detects ongoing record changes. Administrator credentials remain in memory and are never included in the archive.

Before the archive is labelled verified, it is decrypted, migrations are applied to a disposable local PGlite PostgreSQL engine, business rows are restored with constraints enforced, every stored value is compared, and document bytes are written/read in a disposable private directory and checked with SHA-256. Temporary restore data is removed afterwards. Authentication user IDs are recreated as references in the test database; passwords, active sessions and provider configuration are outside this business-data backup.

Archives are stored outside the repository in `../Victoria Private Backups` (directory 0700, files 0600). The randomly generated recovery key is in `.private/victoria-recovery-key.txt` (0600). Both are excluded from Git. Do not lose the recovery key: an archive cannot be decrypted without it. Keep a protected copy of the key separately from a protected off-device copy of the archive.

Commands from the repository:

```sh
SUPABASE_CLI=/path/to/authenticated/supabase npm run backup
npm run backup:verify -- '/absolute/path/to/archive.vbackup'
```

This is a manual local backup. No scheduled/off-device backup service was enabled. The rehearsal restores into a local database and temporary files, not a hosted Supabase project. A hosted disaster recovery also requires provisioning Auth users, configuring the provider and uploading the files into private Storage. No production restoration or deletion is performed by the rehearsal.

## Excel export

The protected `/export` screen downloads a real `.xlsx` workbook. Users select customers, policies/renewals, the original ten-column vehicle layout, tasks, commissions, document metadata and activity history. Archived customers and all linked records are excluded unless explicitly included. Empty sheets retain headers; exports cover all loaded rows, not just the visible table page.

Preparation reloads records using the signed-in user's repository and existing server RLS. An additional agency/customer/policy filter prevents cross-agency joins. No administrator credentials, private storage paths, uploader identifiers, document bytes or signed document links are exported. The workbook is built in browser memory and downloaded after an explicit click, including on mobile. Blob URLs are revoked when selections change or the screen unmounts. No new server endpoint, database migration or persistent browser data store was added.

Strings remain explicit text cells, including leading-zero identifiers and values beginning with formula characters. There are no exported formulas or external hyperlinks. Calendar dates use numeric Excel serials with `dd/mm/yyyy` formatting; money stays numeric, blank and zero remain distinct, and original ambiguous commission/coverage strings are preserved. The workbook uses right-to-left views, column widths and filters. The screen explains that the spreadsheet contains unencrypted personal data and does not replace the encrypted business backup.

Local verification: 54 unit tests including nine export integrity/confidentiality cases; four desktop/mobile Chrome browser scenarios covering downloaded workbook contents, selections, leading zeroes, Blob revocation, protected logout, responsive layout and fresh records added from a second tab. Production build, TypeScript, lint and formatting pass. Browser checks use an iPhone-sized Chrome viewport, not physical iPhone Safari.

## Workflow release validation

Typecheck, lint, unit tests, existing isolation/hardening checks, new workflow SQL checks, encrypted-backup tampering/restore checks and desktop/mobile browser workflows are run before release. Production migration, final encrypted backup and isolated hosted/browser verification are recorded after publication.

Optimistic conflicts use `PT409` (HTTP 409). The hosted integration check exposed the provider retrying `40001`, so a second migration replaces that error before release. See [Supabase’s explanation](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). New workflow requests also have bounded client timeouts.

Release evidence:

- Production migrations `202610070001` and `202610070002` applied successfully.
- 45 unit tests; 46 original PostgreSQL isolation checks; 20 hardening checks; eight document-handler checks; 11 new workflow SQL checks; three encrypted-backup checks.
- The full demo browser run passed 14 desktop/mobile scenarios, with four hosted-only scenarios skipped; affected workflow/import cases passed again after the final changes.
- The hosted API rerun passed 26 checks and removed all temporary data. The first deployed UI run exposed numeric-only matching of an alphanumeric policy query; this has a regression test and was corrected before final verification.
- Two encrypted archives were created from real business records. Both decrypted and restored successfully into a disposable local PostgreSQL database and temporary document files; stored values and document hashes matched. Neither archive contains provider passwords or active Auth sessions, and no production records were restored/overwritten.
- Dependency audit: zero reported vulnerabilities.
