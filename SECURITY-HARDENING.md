# Victoria — personal-use security controls

6 October 2026. This supersedes the proposed remediation plan in `SECURITY-REVIEW-2026-10-06.md`. The owner explicitly declined mandatory MFA and clarified that this is a personal-use application. No external antivirus service or additional server is required or provisioned.

## Controls implemented

- Public email signup disabled. Email verification retained. Newly set passwords require at least 12 characters. Secure password change enabled, sign-in rate limit reduced to 15, JWT lifetime reduced to 900 seconds. Existing passwords are not reset by this change.
- Auth site URL and recovery redirect restricted to `https://victoria-insurance-tau.vercel.app` and its `/reset-password` route. Development redirects were removed from production.
- Database SSL enforcement enabled. Browser/API connections already use HTTPS.
- CSP restricts scripts/workers to this origin and data connections to this Supabase project. Framing is blocked with both `frame-ancestors 'none'` and `X-Frame-Options: DENY`. MIME sniffing, referrers and unneeded device permissions are restricted. Inline styles remain permitted for the component library; inline scripts/eval are not permitted.
- Vitest updated to 5.0.3. The installed dependency audit reports no known vulnerabilities. The document function pins the same Supabase SDK version as the audited application: 2.117.2.
- Agency access now requires the JWT's session to still exist in `auth.sessions`, belong to the user, and be under eight hours old. Sign-out therefore prevents continued database access with an otherwise unexpired token. The browser also signs out after 15 minutes without interaction; this idle timer is a user-interface protection, not a server-side inactivity policy.
- New profiles default to viewer. The existing provisioned owner is admin. Database policies independently enforce editor/admin write permission. Only admins manage roles or archive/restore documents; the last admin cannot be demoted. There is no public user-provisioning endpoint. For a single-user agency, team controls are hidden.
- Browsers cannot directly read, sign, upload, overwrite or delete files in `customer-documents`, or directly write document metadata. The `documents` function validates the user with Supabase Auth and verifies their active session/agency/role through authenticated database RPCs before using platform-provided server credentials.
- Uploads validate ownership, policy/customer association, MIME allowlist, size, byte signature, filename length and document type. Body limits apply to streamed multipart and JSON bodies, not only `Content-Length`. SHA-256 is recorded for uploaded bytes. Database request counters limit upload/access operations.
- Document removal is an atomic, audited soft deletion. It retains the object and metadata, blocks new links and supports admin restoration from `/security`. There is no browser permanent-delete route. Requests for document links are also recorded in the application activity log.

## Personal document policy and limitations

Files are **not scanned by an antivirus engine**. Signature, MIME and size checks do not detect every malicious PDF, image or DOCX. Existing and newly uploaded files are labeled `unscanned`, never automatically labeled `clean`.

For this personal-use deployment, the uploader may explicitly confirm downloading their own unscanned file. The server independently enforces uploader ownership and affirmative consent, and issues the link with attachment disposition. Colleagues, other agencies and anonymous users cannot use this exception. Files marked pending/rejected remain blocked. An unscanned file is downloaded, not embedded into the application's DOM.

Use this exception only for files from a source you trust and keep the viewing software/device updated. A compromised authenticated account could still upload or download its own files. This is a deliberate limited personal-use policy following the owner's clarification, not a claim that antivirus scanning has been implemented.

Signed URLs last 60 seconds. Already-issued URLs may work until expiry after archival/sign-out. Previously downloaded copies cannot be recalled. Storage and metadata insertion are separate operations; a failed insert attempts cleanup, and orphan reconciliation remains an administrative task.

## Verification

- 37 application/import unit tests passed after the dependency upgrade.
- 46 historical migration/RLS checks and 20 new PostgreSQL hardening checks cover roles, expired/revoked sessions, protected storage, consent, audit events, reversible deletion and agency isolation.
- Eight request-handler checks cover unauthorized requests, origins, signatures, streamed size limits, unscanned status and protected link creation.
- Ten demo browser scenarios passed across desktop and iPhone-sized Chrome; hosted-only cases are skipped there. A physical iPhone/Safari was not used for this verification.
- Production migration `202610060001_security_hardening.sql` and the `documents` Edge Function were applied. Hosted verification creates only isolated temporary agencies/accounts/files and removes them in `finally`.
- The final hosted run passed 25 checks, including production document upload/download, the unscanned-file confirmation and archive restoration. Three additional deployed browser scenarios passed (agency switching, viewport bounds and idle expiry followed by fresh login). The first document browser run required a locator correction because the new status label changed the table cell's accessible name; its rerun passed. All temporary fixtures were removed.
- The production frontend and security headers were verified after publishing. A real browser confirmed the former foreign-iframe embedding now fails. Final npm audit: zero known vulnerabilities across development and production dependencies.
- Production password recovery passed with a temporary account: invalid links were rejected, the generated valid link redirected to the production reset page, mismatched passwords were rejected, the new password worked and the old one failed. No email was sent, and the temporary account was deleted.

Run `npm run test:hardening`, `npm run test:security`, `npm test`, and `npm run test:e2e` for local coverage. Run the explicitly opted-in hosted suite with `E2E_BASE_URL=https://victoria-insurance-tau.vercel.app` to include the deployed frontend. No credentials, session tokens or private file contents should be added to test logs or browser traces.

## Operational follow-up

The Supabase backup API returned no available physical backups and PITR disabled during this review. No paid plan was purchased and no full restore rehearsal was performed. Document soft deletion is **not** a database or off-site backup. Arrange backups and test a restore before relying on this as the only copy of sensitive records; retain the original source Excel separately in protected storage meanwhile.

MFA was intentionally not enabled. A stolen password remains a relevant risk. Account-administrator security for Supabase, Vercel and GitHub, off-site backups and provider-level alerting are outside the code controls above and have not been certified by this work. No security audit provides a guarantee against every attack.
