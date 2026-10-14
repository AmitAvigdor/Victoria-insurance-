# Policy report import — 14 October 2026

Victoria now recognizes the supplied policy-report and customer-roster headers,
including separate first/last names, surname-first names, insurer, vehicle,
compulsory/comprehensive premiums, supplied total premium, email information and
review notes. Header rows are detected after introductory rows. Each sheet is
reviewed and imported separately through the existing protected import screen.

## Interpretation and review

- Missing ID numbers and contact details remain blank. Dates are never invented.
- Supplied total premiums remain numeric; missing totals remain null and zero
  remains zero. Coverage premiums are preserved separately without automatically
  adding them together. Extra vehicle/email details remain in notes by default.
- Recognized source insurance labels map to existing application categories;
  the original label is preserved in notes. Professional liability maps to Other.
- Rows with incomplete or invalid policy details create a customer and a
  completion task. Cancellation rows create review tasks and never automatically
  cancel an existing policy. Unknown types require review rather than guessing.
- Nameless rows create unassigned review tasks containing the complete source
  row. An explicit customer selection can assign these rows before import.
- A customer-roster row creates only a customer, without fabricated policies.
- Without an ID number, existing customers are not merged by name. Same-name
  grouping within this report workflow is an explicit opt-in; manual row/existing
  customer links remain available. Ambiguous name splitting requires review.
- Existing-policy ownership cannot be changed. A source name variant requires
  explicitly selecting the existing owner. Existing updates require selecting
  individual fields and pass the existing server validation/conflict checks.
- Numberless vehicle rows also recognize a policy created manually or by an older
  import when insurer, registration and both period dates match. Multiple matching
  policies require explicit selection instead of creating another policy.
- Source row identities and task provenance prevent exact retries from adding
  duplicates. Changing identifying fields can require manual linkage. No fuzzy
  name matching is performed, and edited/removed task provenance is not recoverable
  automatically. Completed review tasks with intact provenance stay deduplicated.

No production schema, privileges, storage policy, signup setting or security
headers were changed. The original spreadsheets were read locally and were not
uploaded to the database or added to Git. Browser tests use fictional fixtures.

## Verification

- All 70 unit tests pass, including 16 report cases covering amounts, missing
  fields, type aliases, unassigned tasks, ownership, retries and reviewed updates.
- Production build/TypeScript, lint, formatting and whitespace checks pass.
- 18 existing desktop/mobile browser scenarios passed; 4 hosted-only cases were
  skipped locally. Both new report scenarios passed after correcting a test's
  button locator. Screenshots were visually reviewed at desktop/iPhone sizes.
- All sheets from both supplied workbooks were processed against a disposable
  in-memory repository with input-schema and duplicate checks, with name grouping
  both disabled and enabled. No actual records were saved to the live database.
- The policy sheets contain 67, 5 and 57 rows. Across these sheets the simulation
  created 77 policies and 51 review tasks; one repeated row was skipped. Eleven
  tasks were unassigned because their source rows had no customer name. The
  additional 123-row customer roster also parsed successfully. New-customer counts
  vary with the explicit grouping/link choices and existing records.
- Immediate retries and the overlapping second workbook added zero records in
  the simulation. The simulation is not proof of a production write; live writes
  remain behind the application's existing explicit review and authorization.
