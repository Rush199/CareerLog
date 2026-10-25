# Release checklist

- [x] Existing stack and design retained.
- [x] Readable modules, write-response handling, validation, duplicate-action/session guards.
- [x] Search, status, statistics, due-follow-up filter, and Done action.
- [x] Authentication/application regression tests and transactional database isolation test.
- [x] CI configuration, setup instructions, and browser checklist.
- [x] Sign-in/sign-up screenshots and a scan for common secret-token/private-key patterns.
- [x] Live browser create/edit/status, session/record persistence, search/filter/counts, and follow-up completion verified.
- [x] Synthetic-data dashboard screenshot captured without the account email.
- [x] Approved QA sample deleted; a fresh browser session and database query confirmed no QA records remain.
- [x] Logout cleared the session and the workspace remained signed out after reload.
- [ ] Source published to GitHub and CI confirmed there.
- [ ] Intended audience verified on the deployed website.

The hosted copy currently has owner-only Sites access. Publishing code on GitHub does not change it. Auth email delivery and redirect allowlists are account configuration. Configure SMTP before external registration; keep email confirmation enabled.
