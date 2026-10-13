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

- **Node 20 is end-of-life: move to Node 22 LTS, then upgrade `expo-server-sdk`.**
  Why: no more security fixes for Node 20; newer `expo-server-sdk` versions need a newer Node.
  Where: `server/package.json` (`engines.node`), `server/Dockerfile`, Render service settings.
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
- **Jest leaves React Query cache timers running in three Prompt 4/5 test files.**
  Why: `npm test` ends with "A worker process has failed to exit gracefully"; that warning hides real leaks (e.g. a new timer in app code) and can slow or hang `--detectOpenHandles` runs.
  Where: `mobile/src/api/__tests__/postLists.test.ts`, `mobile/src/hooks/__tests__/likeMutation.test.tsx`, `mobile/src/api/__tests__/upload.test.ts` (`new QueryClient()` with the default 5-min `gcTime`: use `gcTime: Infinity` as `pushTap.test.tsx` does, or `qc.clear()` after each test).
