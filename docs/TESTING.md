# Testing CareerLog

Run `npm ci`, `npm run check`, `npm test`, and `npm run format:check`.

The Node tests cover authentication states, validation, follow-ups, combined filters, dashboard counts, batched requests, denied writes, CRUD rendering, failed saves, duplicate submissions, reload behavior with a persistent fake repository, and responses after sign-out. LinkeDOM supplies a lightweight DOM. These tests mock network/auth boundaries; they do not prove email delivery or replace a live-browser check.

## Database authorization

Run the **entire** `tests/rls.sql` script as the project owner in the Supabase SQL editor. It creates two random users and application fixtures inside a transaction, exercises real authenticated/anonymous role policies, then rolls everything back. On an assertion failure, roll back the editor transaction. Never remove the rollback.

It checks own-record CRUD, cross-user read/update/delete isolation, spoofed inserts, reassignment of ownership, company/status constraints, and anonymous denial. Fixtures have no usable passwords.

## Browser checklist

Use synthetic application details. Never include real notes, passwords, or tokens in screenshots.

1. Register, confirm the latest email, sign in, and refresh to verify session persistence.
2. Request password recovery and complete it yourself. Sign out and verify normal sign-in controls return.
3. Create an application with notes and a follow-up. Reload and verify all values remain.
4. Edit company, notes, dates and status. Reload and verify changes.
5. Combine company/role search, status, and due-follow-up filters; test empty results.
6. Verify overdue/today/upcoming labels. Offer/Rejected outcomes are excluded from due counts.
7. Use Done to clear a follow-up. Reload and verify it stays cleared.
8. Delete only disposable test data. Reload and verify deletion.
9. Disconnect the network, attempt a save, and verify form values remain. Reconnect and retry.
10. Test keyboard navigation, dialog controls, and a narrow mobile viewport.
11. Confirm deployed Auth URLs, email delivery, and the intended hosting audience.

## Verification record

On 24 October 2026 the automated checks and the live `tests/rls.sql` authorization test passed. SQL fixtures were rolled back. The existing account had completed confirmation and sign-in. Live-browser CRUD and password recovery are recorded separately; mocked tests alone are not end-to-end verification.

During the 25–26 October browser session, the deployed app successfully created a disposable application, retained the session and record after reload, edited role/status/notes, updated counts, combined search/status/due filters, showed empty results, and persisted follow-up completion after another reload. The dashboard screenshot contains only synthetic application data. A temporary browser-automation timeout occurred during deletion; a fresh browser view and a database query subsequently confirmed deletion and zero QA records remaining. Logout also cleared the workspace and remained signed out after reload. Password recovery still needs the account owner's manual email check.
