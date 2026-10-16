# MeetNet backlog

Open items that are known but not scheduled yet. Each line: what, why it matters, where it lives.
Remove an item in the same change that fixes it.

_Last updated: 2026-10-13._

## Web

- **Bottom nav highlights "Post" on `/post/<id>` pages.**
  Why: the shared-post page looks like the compose screen is open, which is confusing.
  Where: `nexusnetwork/src/components/BottomNav.jsx` (`pathname.startsWith(t.to)` also matches `/post/<id>`).
- **Shared post page (logged out) should say "Log in to like or reply".**
  Why: today like/reply on `/post/<id>` fail silently for logged-out visitors (no token is sent, handlers are no-ops).
  Where: `nexusnetwork/src/pages/SinglePost.jsx` (renders `PostCard` with empty `currentUserId` and no-op handlers).
- **`Onboard.jsx` has 4 pre-existing ESLint errors** (unused variables).
  Why: they hide new lint problems in the signup page and block a clean `npm run lint`.
  Where: `nexusnetwork/src/pages/Onboard.jsx`.

## Server

- **Server dependency upgrade: right after the Prompt 7 merge, as its own deploy (branch `server/security-deps` in a worktree from `main`).**
  Why: `npm audit --omit=dev` (2026-10-13): 1 critical, 5 high, moderates, 1 low. Assessed 2026-10-13: the critical one (`proxy-addr` CVE-2026-90711) is **not exploitable here** (`trust proxy` is the hop count `1`; the bug is in compiled IPv6 trust subnets), and neither are `cloudinary` (signatures never reach clients), `ip-address` (only `net.isIP`-checked strings reach it), `mongoose` (dotted keys refused by `mongoSanitize`) or `body-parser` (valid limits). **Reachable: `compression` DoS (every response), `multer` DoS (signed-in uploads), `morgan` log forging, `qs` DoS** — fix those first.
  Where: `server/package.json`: express 4.22.3 (qs ~6.16, body-parser 1.20.6, proxy-addr 2.0.8 on a fresh lock), compression 1.8.2, multer 2.4.0, express-rate-limit 8.7.1, mongoose 9.11.x, morgan 1.12.1; cloudinary 2.11 needs `multer-storage-cloudinary` (peer `cloudinary ^1`) replaced by a small multer storage engine around `upload_stream`; also let `services/accountDeletion.js` accept only public ids of `[\w/-]` (defence in depth). Full server suite, then deploy with the owner's OK.
- **Move the server to Node 24 LTS, then upgrade `expo-server-sdk` to 7.**
  Why: Node 22 (in use since Prompt 7) gets security fixes only until 2027-04-30. `expo-server-sdk` 6+ is ESM-only: plain Node 22 loads it, but Jest can only `require()` an ESM package natively on Node 24.9+, so on Node 22 the server suite can't load it (a Babel transform doesn't help: Jest refuses `"type": "module"` files before transforming). On Node 24 the upgrade needs no code change (same API: `Expo`, `isExpoPushToken`, chunking, tickets, receipts).
  Where: `server/.nvmrc`, `server/package.json` (`engines.node`, `expo-server-sdk`), `server/Dockerfile`.
- **`replyCount` is never decreased when a reply is deleted.**
  Why: the college/global feeds send only the last 5 replies, so clients rely on `replyCount` for the total; after deletions it overcounts (the app works around it in `mobile/src/lib/postView.ts` `replyCountOf`).
  Where: `server/routes/posts.js` (`DELETE /:id/replies/:replyId` pulls the reply without `$inc: { replyCount: -1 }`).
- **Refresh tokens.**
  Why: sessions are a single 30-day JWT with no refresh, so users are logged out every 30 days and a stolen token stays valid until it expires (only `logout-all` / password change revoke it).
  Where: `server/utils/token.js` (`expiresIn: '30d'`), `server/middleware/auth.js`, clients' auth stores.

## Infrastructure

- **Render free plan: move to a paid instance before the mobile beta.**
  Why: the free instance sleeps after ~15 min idle (first request can take ~60 s, bad for app launch) and keeps only 7 days of logs (too short for incident checks).
  Where: Render dashboard, service `surajya` (see `docs/DEPLOYMENT.md`).

## Email

- **Resend bounce webhook not configured (`RESEND_WEBHOOK_SECRET` unset).**
  Why: without it `emailBounced` is never set, so users with a dead address are never asked to change it.
  Where: `server/routes/webhooks.js`; Resend dashboard (webhook to `https://surajya.onrender.com/api/webhooks/resend`); Render env `RESEND_WEBHOOK_SECRET`.

## Mobile

- **App Links / Universal Links need the store signing identities.**
  Why: `assetlinks.json` has the EAS keystore's SHA-256 (Prompt 6), which covers EAS-signed APKs only; Play-installed builds are re-signed by Play App Signing, so its SHA-256 must be added at the Play launch, and iOS needs the Apple Team ID. Until then those links open the browser instead of the app.
  Where: `nexusnetwork/public/.well-known/assetlinks.json` (add the Play Console → App integrity fingerprint), `nexusnetwork/public/.well-known/apple-app-site-association` (`TEAMID`); app side in `mobile/app.config.ts`.
- **Run Maestro p4-14, p4-15 and p5-18 on the emulator before Prompt 7.**
  Why: they couldn't run on the owner's phone during the Prompt 6 checks (p4-14/15 switch on airplane mode and pick a test photo from the device's Download folder; p5-18 needs a device without a mail app), and the emulator didn't fit in memory next to Docker then. Not a merge blocker for Prompt 6: the app isn't shipped yet, the merge deploys only server + web.
  Where: `node .maestro/run.mjs --only p4-14,p4-15,p5-18` (needs `meetnet_oppo`, Metro and Mongo; without Docker see `.maestro/README.md` "Without Docker / on a phone").
- **Expo SDK 57 patch updates — next small change, before Prompt 8.**
  Why: `npx expo-doctor` (2026-10-17) expects expo ~57.0.30, expo-router ~57.0.28, expo-notifications ~57.0.23, expo-constants ~57.0.22, expo-linking ~57.0.13, @expo/ui ~57.0.25 (we have 57.0.28 / .26 / .22 / .21 / .12 / .23). Native code changes (expo-notifications), so it was kept out of the Prompt 7 merge.
  Where: `cd mobile && npx expo install --fix`, restart Metro with `--clear`, new development build, Maestro rerun (phone mode or emulator), the owner's phone eye-check, then merge.
- **Investigate the +250 ms first frame before Prompt 8** (739–791 → ~1020 ms on the OPPO since Prompt 7; accepted for the P7 merge, not a blocker).
  Why: removing Sentry's start-up providers gained only ~20 ms (STORE_READINESS.md, "Cold start"); the rest comes with the Sentry native SDK, the SDK 57 patch updates or expo-device's removal.
  Where: build one preview without `@sentry/react-native` (and one with only the Expo patches) and measure with `scratchpad`-style `am start -W` runs to split them.
- **Run Maestro p7-06 (offline) on the emulator.**
  Why: it needs real network loss (airplane mode), which the runner never does on a phone; skipped in phone-mode runs.
  Where: `node .maestro/run.mjs --only p7-06` on `meetnet_oppo`.
- **Jest leaves React Query cache timers running in three Prompt 4/5 test files.**
  Why: `npm test` ends with "A worker process has failed to exit gracefully"; that warning hides real leaks (e.g. a new timer in app code) and can slow or hang `--detectOpenHandles` runs.
  Where: `mobile/src/api/__tests__/postLists.test.ts`, `mobile/src/hooks/__tests__/likeMutation.test.tsx`, `mobile/src/api/__tests__/upload.test.ts` (`new QueryClient()` with the default 5-min `gcTime`: use `gcTime: Infinity` as `pushTap.test.tsx` does, or `qc.clear()` after each test).
