# Idle recovery remediation — 2026-11-28

The README and `evidence/` document the original investigation. The standalone test sources now assert corrected behavior. Historical screenshots/logs have been retained unchanged; they are not evidence of current behavior.

## Changes

- AppShell uses the shared throwing table-grid fetcher, allowing TanStack Query to retain the last successful grid and report a background error. Touch POS shows a skeleton before first data and a retry view on initial failure, while keeping its workspace hooks mounted.
- Each HTTP attempt and refresh has a 15-second fetch/body deadline using AbortController plus a promise race, compatible with Android 11 without AbortSignal.any/timeout. Body text is read once for success, errors and verified-401 inspection. Timers and cancellation listeners are removed. Explicit cancellation remains AbortError; a cancelled caller stops waiting without cancelling a refresh shared with another caller. No network/timeout mutation retry was added; the existing verified-401 refresh/retry is retained.
- Refresh single-flight is owned by auth revision, access token and user id. Logout/login and account replacement invalidate late results, including same-browser sync via direct store replacement. Transient failures, malformed success bodies and 403 preserve auth/preferences; verified refresh 401 retains revocation behavior.
- Proactive refresh retries every 30 seconds after a transient failure while visible; logout/session change/teardown stop retries. Reconnect and foreground/online reconcile active realtime-dependent queries, without clearing cache or replaying historical notices. Admin settings are marked stale without refetching their open form.
- Schedule query hydration now preserves local edits when a background response arrives. Payroll editors hydrate only on explicit opening; profile is deliberately excluded from reconnect invalidation because it hydrates fields on every response. POS draft menu hydration already retains quantities and notes.
- Zod response errors use neutral DATA_VALIDATION_ERROR, separate from user-input 422 and runtime crashes. Diagnostic copy contains the fixed catalog key, ISO time, safe error class/browser, sanitized pathname, UUID request id when available and public entry asset filename when available. QR route tokens, search/hash, raw messages/issues/stacks and arbitrary error class names are excluded. The copy feedback timer is cleaned up.

## Regression matrix

| Trigger | Coverage |
|---|---|
| Cached grid network/503/schema failure then recovery | `src/lib/pos-table-grid-query.test.ts`; E2E background 503 and foreground network cases |
| Initial pending/error/valid empty grid | E2E pending skeleton, initial error/retry and valid-empty cases |
| Refresh fetch/body stalls and concurrent callers | `api-client-idle-recovery.test.ts`: bounds shared refresh fetch/body, releases single-flight and later refresh succeeds |
| Success/401/503 response body stalls with caller signal | Parameterized bounded-body transport tests |
| Caller cancellation, pre-cancelled mutation, shared refresh isolation | Transport cancellation tests; no request is sent for a pre-aborted POST |
| Logout/account replacement during refresh | Transport late 200/401 and direct cross-tab account replacement tests |
| Create/kitchen/checkout POST timeout | Parameterized tests advance 120 virtual minutes and assert exactly one original POST |
| Reconnect/foreground after missed menu event | Provider active menu query changes from old to new data; schedule component test keeps edited cells |
| Proactive transient failure | Provider test retries while active and stops on teardown |
| Zod versus runtime and safe diagnostics | Error-display normalization and clipboard tests, schema-error E2E |
| Unsent cart quantity/note and explicit submit | E2E virtual 15/30/120-minute outage/recovery; one draft save and one submit |
| Open order, explicit kitchen and checkout | E2E keeps note across failed polling; one kitchen call, no checkout until confirmation, one checkout after confirmation |
| Settings dirty draft | E2E 30-minute foreground recovery retains input and emits no settings PUT |

## Verification status

Focused regressions were run red before implementation: original transport tests failed on unbounded refresh/body/cancellation and late ownership; updated standalone provider tests failed on retry/reconciliation; three browser checks failed on pending state, background grid retention and schema classification. The red transport tool output is recorded in the chat (19:32:41); red provider/browser logs were saved at `/tmp/idle-socket-red.log`, `/tmp/idle-browser-red.log`, and error-display red output at `/tmp/idle-errors-red.log`.

Focused post-fix tests passed, including existing socket and Touch POS suites. Both standalone diagnostic commands passed (5 Vitest and 7 Playwright tests). The final POS idle suite contains 10 cases, including initial-error retry and recovery.

Final verification on the isolated worktree completed successfully:

- `pnpm -r typecheck` — passed.
- `pnpm -r test --maxWorkers=2` — 174 files and 1,200 tests passed (shared 103, API 531, web 566).
- `pnpm -r lint` — passed.
- `pnpm -r build` — passed.
- `pnpm --filter @fnb/web-app exec playwright test --grep-invert @real --workers=4` — 254 passed, 8 skipped, 0 failed across Chromium desktop and WebKit mobile/tablet/desktop. The run includes cart preservation, touch POS sales actions and virtual idle/recovery tests.
- `git diff --check` — passed.

The Playwright suite used Node 22.23.5; the machine's default Node 26 caused Vite to abort in an earlier attempt. Physical Android 11/Chrome and real two-hour device use remain unverified.

## Limits

No database mutation, deployment, commit or push was performed. Physical Android 11/Chrome behavior, real two-hour device operation, actual printer/network hardware and an authenticated production session remain unverified. Virtual timer tests do not reproduce Android Doze, RAM pressure, radio reconnection or actual printing. The original two production screenshots still cannot be assigned a definitive common trigger from available evidence.
