# MeetNet — store readiness (Prompt 7)

Audit of the app (`mobile/`), the API (`server/`) and the web pages it links to, against what Apple
App Review and Google Play ask for. Branch `mobile/p7-store-readiness` (from `main` 241db37).
Audited and fixed 2026-10-13. Version stays **1.0.0**.

Status: ✅ done · 🟡 partial · ❌ missing · 👤 needs the owner (outside the code) · ⏳ waiting for a
device check. **Audit** = what was there before Prompt 7; **Now** = after the fixes in this branch.
"Tests" are Jest (app) / Jest + supertest (server); `p7-…` are Maestro flows (`.maestro/README.md`).

## 1. User-generated content (Apple guideline 1.2)

| Item | Audit | Now | Notes |
|---|---|---|---|
| Terms / EULA accepted at signup | ✅ | ✅ | `TermsCheckbox` (18+, Terms, Privacy, Guidelines) → `acceptTerms: true` → server stores `termsAcceptedAt` |
| Blocking accept-terms screen for accounts without `termsAcceptedAt` | 🟡 server only | ✅ ⏳ | `AcceptTermsScreen` (`src/components/TermsGate.tsx`): overlay above the app, the three documents, 18+ checkbox, **Agree and continue** (`POST /users/me/accept-terms`) or **Log out**; Back blocked; the push pre-prompt waits for it. Server now keeps the **first** acceptance date (test). Tests + p7-01 |
| "No tolerance for objectionable content or abusive users" | ❌ | 🟡 👤 | Said on the accept-terms screen; the Terms page itself must say it too (owner's legal text) |
| Report a post (⋯ menu) | ✅ | ✅ | `PostMenuSheet` → `ReportSheet` → `POST /posts/:id/report` |
| Report a reply | ❌ app / ✅ server | ✅ ⏳ | Long-press a reply, or its ⋯ → `ReplyMenuSheet` → Report reply → `POST /posts/:id/replies/:replyId/report`. Tests + p7-02 |
| Report a profile | ✅ | ✅ | `ProfileMenuSheet` → `POST /users/:id/report` |
| Block from post menu / reply menu / profile | 🟡 (no reply menu) | ✅ ⏳ | Reply menu has Block (named authors; the anonymous author can only be reported). p7-03 |
| Blocked content disappears at once everywhere | 🟡 | ✅ ⏳ | Now also their **replies** in every cached post (`removeRepliesBy`, counts follow), their **notifications**, and an open post of theirs ("Post not available"). Tests + p7-03 |
| Profanity filter (client warning, server authority) | ❌ | ✅ ⏳ | Server: `server/utils/moderation.js` (whole words, leet / accents / stretched letters undone; "Scunthorpe", "assess", "cocktail" pass) in `POST /posts` (text, tags, PDF name) and `POST /posts/:id/replies` → 400 `PROFANITY`. App: `src/lib/moderation.ts`, same list (a test compares the two files); compose and the reply box warn and keep sending disabled. Server 35 + app 35 tests, p7-04. The list (43 English / Hindi / Marathi words) is a starting point 👤 |
| Community guidelines + support@themeetnet.com from Settings | ✅ | ✅ | Settings → Legal / Support. Mailbox works (ImprovMX forwarding, verified 2026-10-10) |
| … and from the report sheet | ❌ | ✅ ⏳ | "We review every report within 24 hours and remove content or accounts that break our Community Guidelines. Questions: support@themeetnet.com" (both links work). p7-02 |
| Reports actually reviewed within 24 h | — | 👤 | The sheet promises it: someone has to look at new reports daily (`reports` collection / admin routes) |
| Legal texts final | 👤 | 👤 | `Terms.jsx`, `Privacy.jsx`, `CommunityGuidelines.jsx`, `DeleteAccount.jsx` still show "TODO(owner): draft text" |

## 2. Account deletion (Apple 5.1.1(v), Google Play)

| Item | Audit | Now | Notes |
|---|---|---|---|
| In-app deletion screen | ❌ (web page in the in-app browser, no session) | ✅ ⏳ | Me → ⚙ Settings → **Delete account** → `app/me/delete-account.tsx`: what gets deleted, password, final "Delete your account?" confirm → `DELETE /users/me`. Wrong password: "Incorrect password", still signed in. Links "Forgot your password?" and the web page. Tests + p7-07 |
| Server `DELETE /users/me` | ✅ | ✅ | Password (400 if wrong), 5 / 15 min per user, 204; deletes posts (incl. anonymous), replies, likes, follows / requests / blocks, notifications, reports, resets, push tokens, Cloudinary files of current posts / avatar / cover |
| Local cleanup after deletion | 🟡 | ✅ | `deleteAccountLocally()`: no push-token DELETE (already gone on the server), the push registration and any pending removal for that account forgotten (none written), badge 0, shade cleared, then logout (MMKV, query cache, stores) → welcome + toast "Your account was deleted". Tests |
| Web `https://themeetnet.com/delete-account` works logged out | ✅ | ✅ | Public route (no login guard), live 200; logged out: what is deleted, log in, reset password, or email support (30 days). In-app path corrected to "Me → Settings → Delete account" (`DeleteAccount.jsx`, this branch) |
| Not deleted by the server | 🟡 | 🟡 | `EmailVerification` codes (expire in 10 min); Cloudinary files of posts deleted earlier / old avatars (no `destroy` on replace or post delete) — backlog |

## 3. Polish

| Item | Audit | Now | Notes |
|---|---|---|---|
| Loading skeletons / empty / error states | 🟡 | ✅ | Replies sheet error now has **Try again**; offline with nothing cached shows "You're offline — This loads as soon as you're back online" instead of an endless skeleton (feeds, post, profile + its posts, Me posts, notifications, people lists, Find, Suggested, Activity) |
| No raw error strings | 🟡 | ✅ | `errorMessage()` shows only the API's 4xx messages and the client's own texts; 5xx bodies, native / JS exceptions never (5xx → "Something went wrong. Please try again."); upload texts are `UserError`s; the missing-env message only in development. Tests |
| Global ErrorBoundary ("Something went wrong / Restart") | ❌ | ✅ | Every root-stack screen (`screenLayout` → `ScreenErrorBoundary`) + expo-router's root `ErrorBoundary`. Restart clears cached data and overlays, then goes Home. Reports to Sentry. Tests |
| Offline banner | 🟡 (Home, Following) | ✅ ⏳ | Also Connect, Me, Notifications, a post, a profile |
| Cached feeds readable offline | ✅ | ✅ | MMKV-persisted queries (24 h) |
| Mutations say "You are offline" | ❌ | ✅ ⏳ | All mutations run with `networkMode: 'always'`: offline they fail at once with "You are offline" and roll back (like, save, follow, reply, report, delete…), login / forms show it inline. Read-marks of notifications still wait for the connection. Tests + p7-06 (emulator only) |
| Labels on icon buttons / gestures | 🟡 | ✅ | Post text and post image get screen-reader actions (activate = open, "Like"); YouTube backdrop wrappers no longer focusable; "See more", "Clear filters", reply ⋯ labelled |
| Touch targets ≥ 44 pt | 🟡 | ✅ | `hitSlopFor(size)`: reply 🗑️ / ⋯, terms checkbox, avatar 📷, "Clear ✕"; photo / PDF ✕ already 48 |
| Font scale 1.3× | 🟡 | ⏳ | Text / Input cap at 1.4×; to check by eye at 1.3× (phone eye-check list) |
| Text contrast ≥ 4.5:1 on #0d0d0d | 🟡 | ✅ | `muted #888888` 5.48 (kept). **`dim` #444444 (2.00) → #848484** (5.20 on bg, 4.56 on bg3). **New `accentText` #d16a6a** (5.54 on bg, 4.53 on the toast) for red text — `accent` #a73333 (2.93) stays for fills, borders, icons. Toast text: `actText` / `green` / `accentText` (≥ 4.5 on #222) |
| Android back on every modal / sheet | ✅ | ✅ | All sheets (`useModalSheet`), RN Modals (`onRequestClose`), router modals; the new reply menu too; accept-terms / update / maintenance block Back on purpose |
| Edge-to-edge insets | 🟡 | ✅ | Someone else's profile now pads its list above the navigation bar |
| No layout jump when the keyboard opens | 🟡 | 🟡 ⏳ | Compose, Edit profile, signup step 2, the new delete-account screen use `KeyboardFooter` (via `Screen footer`); eye-check |
| Haptics only on meaningful actions | 🟡 | ✅ | Like, double-tap like, post success, **follow** (new). Removed: every primary button, tab presses, the + button, segmented tabs |
| expo-image `cachePolicy` + `recyclingKey` | 🟡 | ✅ | Avatar, blurred backdrop, YouTube thumbnails (post + profile), cover |
| Cold start (preview build, OPPO, 3 runs) | — | ⏳ | Deferred: remote config and push registration wait for `whenIdle`; `/users/me` once at start instead of twice. Measured 2026-10-14 (below): the first native frame got ~330 ms slower with Sentry's native start-up providers → both removed from the merged manifest (`removeSentryStartupProviders`, app.config.ts); preview f180a03f to measure |

### Cold start (2026-10-14, OPPO CPH2251, Android 13, signed in as a disposable account, notifications on)

`am start -W` TotalTime = until the first native frame; "Home feed" = from the system's process
start (`am_proc_start`) to the marker logged when Home's list first drew posts (development and
preview builds only; b17a6c61 predates it). One warm-up start discarded, then 3 runs each.

| Build | TotalTime (3 runs) | median | Home feed drawn (3 runs) | median |
|---|---|---|---|---|
| b17a6c61 (main 9d816bc, before Prompt 7) | 1028 / 972 / 989 ms | **989 ms** | — (no marker) | — |
| c186b038 (this branch, Sentry off: no DSN) | 1320 / 1293 / 1336 ms | **1320 ms** | 1624 / 1897 / 1914 ms | **1897 ms** |
| a12dd183 (this branch, Sentry on) | 1357 / 1396 / 1376 ms | **1376 ms** | 1938 / 2029 / 1829 ms | **1938 ms** |

The only start-up components the new APKs add are Sentry's `SentryInitProvider` and
`SentryPerformanceProvider` (content providers, run before `Application.onCreate`): the ~330 ms on
the first frame comes with the Sentry native module, whether a DSN is set or not (Sentry's JS init
adds ~50 ms). ColorOS refuses `pm disable` over adb, so the providers couldn't be switched off for a
test. Applied 2026-10-16: both removed from the merged manifest (`tools:node="remove"`; the JS `Sentry.init`
starts the native SDK anyway; Sentry loses only its automatic app-start span).

**Re-measured 2026-10-17, same session, back to back** (same phone, same disposable account):

| Build | First frame (3 runs) | median | Home feed drawn (3 runs) | median |
|---|---|---|---|---|
| b17a6c61 (before Prompt 7), set 1 | 956 / 749 / 791 ms | **791 ms** | — (no marker) | — |
| f180a03f (providers removed), set 1 | 1023 / 1021 / 1118 ms | **1023 ms** | 1281 / 1325 / 1569 ms | **1325 ms** |
| a12dd183 (with providers) | 989 / 1050 / 1044 ms | **1044 ms** | 1344 / 1521 / 1448 ms | **1448 ms** |
| f180a03f, set 2 | 1021 / 1052 / 969 ms | **1021 ms** | 1357 / 1403 / 1312 ms | **1357 ms** |
| b17a6c61, set 2 | 847 / 737 / 739 ms | **739 ms** | — | — |

Removing the providers gained only ~20 ms on the first frame and ~100 ms on "Home feed drawn"
(the 14 Oct numbers were from a different day; a same-day comparison is the fair one). The first
frame is still **~250–280 ms slower than before Prompt 7**, cause not identified yet: what else
changed natively is the Sentry native SDK itself (loaded with the app), the SDK 57 patch updates
and expo-device's removal. Next step (backlog): a preview without `@sentry/react-native` to split
the two.

## 4. Monitoring

| Item | Audit | Now | Notes |
|---|---|---|---|
| Crash reporting | ❌ | ✅ 👤 | `@sentry/react-native` 7.11 + Expo plugin + `getSentryExpoConfig` (Metro debug ids). `src/lib/monitoring.ts`: on only with `EXPO_PUBLIC_SENTRY_DSN`; user **id** only (set after login, cleared at logout); `sendDefaultPii: false`; no request bodies, auth / cookie headers, push tokens, emails or query strings (`scrubEvent`, tests); 5 % traces; no screenshots / view hierarchy; release `com.themeetnet.app@1.0.0+<build>`, dist = build number (SDK defaults = what the source maps are uploaded for). Live from preview `a12dd183` on |
| Sentry project, DSN, auth token | 👤 | ✅ ⏳ | Org `meetnet` (EU region), project `meetnet-mobile`; DSN, org, project and `SENTRY_URL=https://de.sentry.io/` in `eas.json`; auth token = EAS secret `SENTRY_AUTH_TOKEN` (preview, production; checked by name only). Source-map upload **on**. First build with it: preview `a12dd183` (⏳ upload + a test event) |
| New native module → new dev build | — | ⏳ | Dev build `cf91b4dd` started 2026-10-13 (version stays 1.0.0 per the pre-release rule; commit names "native: adds @sentry/react-native, removes expo-device") |

## 5. Privacy (Play Data safety, App Store privacy labels)

### Permissions (Android merged manifest; iOS Info.plist)

Read from the merged manifests of preview APKs b17a6c61 (before) and c186b038 (this branch): 32 → 26
permissions, exactly the six removals below and nothing else changed.

| Permission | From | Used for | Decision |
|---|---|---|---|
| INTERNET, ACCESS_NETWORK_STATE | RN, NetInfo, FCM | API, offline state | keep |
| ACCESS_WIFI_STATE | NetInfo | connection details (normal permission, not shown to users) | keep |
| CAMERA · NSCameraUsageDescription | expo-image-picker | "Take photo" (compose, profile photo) | keep |
| NSPhotoLibraryUsageDescription | expo-image-picker | photo picker | keep |
| POST_NOTIFICATIONS · iOS alert / badge / sound | expo-notifications | push (pre-prompt, Settings) | keep |
| WAKE_LOCK, RECEIVE_BOOT_COMPLETED, c2dm RECEIVE, launcher badge permissions (Samsung, HTC, Sony, Huawei, OPPO, …) | firebase-messaging, expo-notifications, ShortcutBadger | push delivery, app badge | keep (normal permissions) |
| VIBRATE | Expo template, expo-haptics | haptics, notification vibration | keep |
| RECORD_AUDIO · NSMicrophoneUsageDescription | expo-image-picker default | — | removed (`microphonePermission: false`, already) |
| READ / WRITE_EXTERNAL_STORAGE (≤ API 32) | Expo template, libraries | — (system pickers need none) | **removed** (`blockedPermissions`) ✅ |
| SYSTEM_ALERT_WINDOW | Expo template | dev overlay only | **removed in preview / production** ✅ |
| USE_BIOMETRIC, USE_FINGERPRINT | expo-secure-store | — (no `requireAuthentication`) | **removed** ✅ |
| BIND_GET_INSTALL_REFERRER_SERVICE | expo-application | — (no referrer API use) | **removed** ✅ |
| AD_ID | — | — | absent; blocked as a safeguard |
| NSFaceIDUsageDescription | expo-secure-store default | — | **removed** (`faceIDPermission: false`; introspected Info.plist has none) |
| NSLocalNetworkUsageDescription | expo-dev-client config plugin | dev launcher only; never asked in release builds | stays (text only); remove with a small config plugin if review asks |
| expo-device | — | unused | **package removed** |

### Data the app collects

| Data type (Play / Apple category) | Collected where | Shared with (processors) | Purpose | Optional? |
|---|---|---|---|---|
| Name, email, password (Personal info · Contact info) | signup, login, change email / password | API (Render → MongoDB Atlas); email via Resend | account, sign-in, verification | required |
| College, year, branch, username, bio, skills, projects, roadmap, media links (Personal info · Other) | signup, edit profile | API; public profile | profile, feed, suggestions | partly |
| Profile photo, cover (Photos) | Me tab | API → Cloudinary | profile | optional |
| Posts, replies, photos, PDFs, links, YouTube links (User content) | compose, replies | API → Cloudinary; Google Docs viewer (PDF), YouTube (playback) | the app's content | optional |
| Likes, saves, follows, blocks, interest, reports (App activity) | app actions | API | features, moderation | optional |
| Push token, platform, install id (Device or other IDs) | after notifications are allowed | API, Expo push, FCM / APNs | notifications | optional |
| Crash logs, diagnostics, user id (App info and performance) | once Sentry has a DSN | Sentry | crash diagnosis | — (not linked to email; id only) |
| Location, contacts, audio, advertising id, analytics, purchases | — | — | not collected | — |

Encrypted in transit (HTTPS only in preview / production). No data sold, no ads, no tracking (Apple:
"Data Not Used to Track You"). Deletion: in the app and at `https://themeetnet.com/delete-account`.
Audience 18+.

## 6. Confession switch

| Item | Audit | Now | Notes |
|---|---|---|---|
| `features.confessionsEnabled` hides Confession in compose | ✅ | ✅ | `TypeGrid` filters it; a restored confession draft falls back to Social |
| … and in the Home category chips | ❌ | ✅ ⏳ | `CategoryBar` drops 🤫 Confession; a selected chip falls back to all types (derived, no effect). p7-05 |
| Existing confession posts still anonymous | ✅ | ✅ | `visibleAuthor()` ignores the switch |
| Server enforcement | ❌ | — | `POST /posts` still accepts `confession` (the switch is per platform; not asked) |

## 7. Server

| Item | Audit | Now | Notes |
|---|---|---|---|
| Node 22 on Render | ❌ | ✅ ⏳ deploy | `engines.node` **22.23.3** (latest 22, 2026-09-23) + `server/.nvmrc` (a test keeps them equal) + Dockerfile `node:22-alpine`. Full suite: **14 suites / 280 tests pass on Node 22.23.3** (and on the local Node 24). Render follows `engines`; not deployed yet (owner's go) |
| expo-server-sdk 7 | ❌ | ❌ (stays 5.0.0) | 7.x is ESM-only: plain Node 22 loads it, but Jest can only `require()` an ESM package natively on Node 24.9+, so the suite can't load it on Node 22 (a Babel transform doesn't help: Jest refuses `"type": "module"` files before transforming). Same API otherwise. Backlog: Node 24 LTS + SDK 7 together |
| Accept-terms keeps the first date | ❌ | ✅ | `POST /users/me/accept-terms` sets the date only when null (2 tests) |
| Profanity → 400 `PROFANITY` | ❌ | ✅ | posts (text, tags, PDF name) and replies; `server/API_MOBILE.md` updated |
| Dependency audit | — | 🟡 | Reachable issues fixed in `server/security-patch` (2e1144b: express 4.22.3 / proxy-addr 2.0.8 / qs 6.16, compression 1.8.2, multer 2.4.0, morgan 1.12.1, express-rate-limit 8.7.1), **live since 2026-10-13 17:44Z** and carried into this branch. Left for a later branch: Cloudinary 2.x + own storage engine, public-id restriction, mongoose 9.11.x |

## Owner actions (outside the code)

- **Sentry**: done 2026-10-13 (org `meetnet`, EU; project `meetnet-mobile`; token as EAS secret). Check the first events and source maps of preview `a12dd183`.
- **Legal texts**: final Terms (incl. "no tolerance for objectionable content or abusive users" and
  how reports are handled), Privacy (list the processors: Render, MongoDB Atlas, Cloudinary, Resend,
  Expo, Google FCM / YouTube / Docs viewer, Apple APNs, Sentry), Community Guidelines, Delete account
  (fix the in-app path) — remove the TODO banners.
- **Moderation**: review reports within 24 h; review the word list.
- **Server deploy** (Node 22): your go; rollback = Render → Events → earlier deploy → Rollback.
- **At the store launch**: Play App Signing SHA-256 in `assetlinks.json`, Apple Team ID in the AASA.

## Verification log

| Check | Result |
|---|---|
| Server suite (Node 22.23.3) | 15 suites, 283 tests pass (with the security patch and `/healthz` commit) |
| App: typecheck, lint, Jest | pass: 40 suites, 420 tests (2026-10-16) |
| `npx expo-doctor` | 21/21 checks pass (after the SDK 57 patch updates) |
| Sentry crash tests (f180a03f, 2026-10-17) | JS error **MEETNET-MOBILE-2** (top frame `/src/lib/monitoring.ts:126:20`: source maps work), native crash **MEETNET-MOBILE-3** (`RNSentryModuleImpl.java:542`); no request data; user fields `id` + `geo` (Sentry derives `geo` from the sender IP → turn on the project's "Prevent Storing of IP Addresses" 👤); the JS event's release had been rewritten to "[email]+1" by the email scrubber → fixed (test) |
| Sentry | preview a12dd183 build log: source maps + debug id uploaded (org meetnet, project meetnet-mobile, release com.themeetnet.app@1.0.0+1, dist 1); test event a9a7427d… accepted by the EU ingest (HTTP 200; no user, request or device data) |
| Prebuild (temp copy, production) | blocked permissions written as `tools:node="remove"`; Sentry Gradle step applied, no token in files; iOS Info.plist without Face ID |
| Maestro p7-01 … p7-07 | phone mode (OPPO, owner's OK) 2026-10-13/14: p7-01–p7-05 and p7-07 **pass** (first run found 4 flow / one app issue: password box now cleared after a wrong password); p7-06 (offline) emulator only → backlog |
| Cold start before / after | measured (section 3, "Cold start"): first frame 989 → 1376 ms (Sentry providers), fix proposed |
| Phone eye-check | ⏳ |
