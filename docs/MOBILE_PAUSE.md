# Mobile app — paused (2026-11-14)

Mobile app development is paused while the web version gets new features. This page is the hand-over
for resuming it: what exists, where it lives, how to start the local stack, and the rules that applied.
No secrets here; the places that hold them are named.

**Rule for the web phase:** the installed app builds depend on the API contract in
`server/API_MOBILE.md`. Server changes made for the web must stay backward compatible (no removed or
renamed fields or routes, no changed status codes or error shapes). A change that would break the
contract is flagged to the owner before it is made.

## What is done

| Step | Content | Main / live |
|---|---|---|
| Prompt 1 (server) | Phase 1 mobile backend APIs: sessions, password reset, blocking, push tokens, reports, account deletion, terms, app config, deep links (`server/API_MOBILE.md`) | 169916c (2026-10-04) |
| Prompts 2–5 (app) | Expo SDK 57 app in `mobile/`: auth, feeds and posts, compose with photo / PDF uploads, profiles and the follow system; React Query + MMKV, FlashList, Maestro checks | 1daad80 (2026-10-09) |
| Prompt 6 | Connect tab (find people, suggested, activity), notifications screen, Expo push through FCM, deep links / App Links, forced-update and maintenance screens | 9d816bc (2026-10-13) |
| Security patch (server) | express 4.22.3, compression, multer 2.4, express-rate-limit, morgan, qs | 2e1144b |
| Prompt 7 | Store readiness: terms gate, profanity filter, report / block, offline behaviour, delete account, Sentry crash reports, `/healthz` with the deploy SHA | 0823759 (2026-10-17) |
| Expo SDK 57 patch updates | expo 57.0.30, expo-router 57.0.28, expo-notifications 57.0.23 etc.; `expo-doctor` 21/21 (app only, no deploy) | 71f8dac (2026-10-17) |
| Server deps part B | cloudinary 2.11 with our own multer storage engine (`server/config/cloudinaryStorage.js`), mongoose 9.11, public-id check at account deletion | 59f3f21 (2026-11-13) |
| HEIC fix | HEIC/HEIF uploads are converted to JPG on Cloudinary (`format` only converts formats missing from `allowed_formats`) | 90831cf (2026-11-14) |

Open items are in `docs/BACKLOG.md` (Mobile section) and `mobile/STORE_READINESS.md`.

## Versions

- App `1.0.0` (stays 1.0.0 until the store release), Android first, iOS must keep working.
- Expo SDK 57: expo ~57.0.30, expo-router ~57.0.28, expo-notifications ~57.0.23, React Native 0.86.3,
  React 19.2.3 (React Compiler on), @sentry/react-native ~7.11.0.
- Server: Node **22.23.3** (Render reads `server/.nvmrc`; `package.json` `engines.node` says the same),
  express 4.22.3, mongoose 9.11.2, cloudinary 2.11.0, multer 2.4.0. `npm test` runs Jest with
  `--experimental-vm-modules` (the MongoDB driver loads `os` with a dynamic `import()`).

## Last builds (EAS, Android)

| Build | Profile | App id | Commit | Date | Notes |
|---|---|---|---|---|---|
| **0e40f179** | development | `com.themeetnet.app.dev` | e59aa41 | 2026-10-17 | current dev client (28 permissions); Maestro runs use it |
| **c8493c12** | preview | `com.themeetnet.app` | 0823759 | 2026-10-16 | production API; used for the Prompt 7 delete-account check |
| f180a03f | preview | `com.themeetnet.app` | 2e1144b | 2026-10-16 | cold-start reference (Sentry start-up providers removed) |
| a12dd183 | preview | `com.themeetnet.app` | 241db37 | 2026-10-13 | first Prompt 7 preview |

Development builds have no Sentry DSN and send nothing; preview and production report to Sentry.

## Where everything lives

| What | Where |
|---|---|
| Code | GitHub `jordenXsuraj/surajya`: `mobile/` (app), `server/` (API), `nexusnetwork/` (web), `docs/` |
| EAS / Expo | account **`aniket078s-team`**, project `meetnet` (id `e9b8f796-314e-4501-bdca-29da9c72128f`); profiles in `mobile/eas.json`; secrets as EAS environment variables (`GOOGLE_SERVICES_JSON` file var, `SENTRY_AUTH_TOKEN`); enhanced push security is **on** for the account |
| Expo push robot | robot user **`meetnet-push-sender`**, role **Viewer**, token `push-api-2` — on Render as `EXPO_ACCESS_TOKEN` and in the owner's Windows user variables (never in git or chat) |
| Firebase / FCM | project **`themeetnet`** (Spark); Android apps `com.themeetnet.app` and `com.themeetnet.app.dev`; FCM V1 key only on EAS (`eas credentials -p android`) |
| Sentry | org **`meetnet`**, **EU region** (`meetnet.sentry.io`, API `https://de.sentry.io/`), project `meetnet-mobile`; IP storage off; DSN / org / project in `mobile/eas.json` |
| API hosting | Render workspace **"My Workspace"**, service `surajya` → `https://surajya.onrender.com` (free plan; deploys on pushes to `main` that touch `server/`). Confirm a deploy with `GET /healthz` → `OK <7-char SHA>`; rollback = Render → Events → previous deploy |
| Web hosting | Vercel project `surajya`, team **`jordenxsurajs-projects`** → `https://themeetnet.com` (App Links `assetlinks.json` under `/.well-known/`) |
| Signing | EAS-managed keystore for `com.themeetnet.app`; its SHA-256 is in `nexusnetwork/public/.well-known/assetlinks.json`. Play App Signing's fingerprint must be added at the Play launch (`docs/DEPLOYMENT.md`, "Mobile deep links") |
| Measurement branch | **`perf/cold-start-nosentry`** = commit **d4c9072** (main 0823759 without `@sentry/react-native`). Backed up on GitHub as `backup/perf-cold-start-nosentry`. **Measurement only — never merge it.** |

## EAS build quota (2026-11-14)

Free plan. The Android builds of October 2026 were used up on 2026-10-17 ("will reset on Sun Nov 01
2026"); **no build has been made since the 1 November reset** (last build 0e40f179 on 2026-10-17).
Rule: no EAS build unless it is essential; ask the owner first and say how many builds are left this
month (expo.dev → account → Usage). The first build after the pause is d4c9072 (below), then the
Prompt 8 builds.

## Resume checklist (in this order)

1. **Cold start:** build `perf/cold-start-nosentry` (d4c9072) as a **preview** (ask first, see quota),
   then measure it against preview f180a03f on the same day, 3 cold starts each (`am start -W` and
   the `[startup] home feed first rendered` log line, method in `mobile/STORE_READINESS.md`, "Cold
   start"). Goal: find where the +250–330 ms first frame since Prompt 7 comes from (Sentry's native
   module is the suspect). Then delete the measurement build; never merge the branch.
2. **Emulator runs** on `meetnet_oppo` with dev build 0e40f179 (only when the laptop is free; memory
   rule below): `node .maestro/run.mjs --only p7-06,p4-14,p4-15,p5-18` (offline, airplane mode, photo
   from the Download folder, no mail app — none of them can run on the owner's phone).
3. **Prompt 8 (store release):** Play Console account and app listing, closed testing with the 12
   testers, Render paid plan (no spin-down), DPDP (India data protection) check, Play App Signing
   SHA-256 added to `assetlinks.json`, legal texts final (`mobile/STORE_READINESS.md`, owner items).
4. Before any of it: `cd mobile && npm install && npx expo-doctor` (expect 21/21), `npm run check`;
   `cd server && npm test` on Node 22.23.3.

## Starting the local stack (phone mode, no Docker)

From the repo root; the owner's phone is used only with their OK for that run.

1. **Mongo (native, no Docker):**
   `server/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe --port 38127 --bind_ip 127.0.0.1 --dbpath mobile/.maestro/reports/_mongo-native/data`
2. **Local API** (uploads go to `server/uploads`, nothing reaches Render / Cloudinary / Resend):
   `NODE_ENV=development PORT=5000 MONGO_URI=mongodb://127.0.0.1:38127/meetnet_local PUBLIC_APP_URL=http://localhost:5173`,
   a random `JWT_SECRET`, `EXPO_ACCESS_TOKEN` from the Windows user variable; **unset** the
   Cloudinary, Resend, Render, Vercel and `EXPO_TOKEN` variables. Then `node index.js` in `server/`.
   Seed once with `node .maestro/seed.mjs` (in `mobile/`).
3. **Metro:** `cd mobile && npx expo start --dev-client --port 8081 --max-workers 2` (default workers
   after `--clear` grew to 3 GB). Pre-build the bundle once:
   `http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable`
4. **Maestro on the phone:** `MAESTRO_PHONE=<serial> MAESTRO_MONGO_URI=mongodb://127.0.0.1:38127/meetnet_local MAESTRO_MONGOSH=<path to mongosh.js> node .maestro/run.mjs [--only …]`
   (`mobile/.maestro/README.md`, "Without Docker / on a phone").
5. **Memory rule:** phone mode starts only with **≥ 1.5 GB free** once Mongo, the API and Metro are
   up, and stops as soon as free memory drops **under 1.0 GB**; emulator runs stop under **2.5 GB**
   free after the emulator starts. Brave stays open (the owner works in it).
6. **Phone (OPPO CPH2251, ColorOS):** adb can't kill the app or run `pm grant/disable/clear`, and adb
   authorisation drops after reboots or reconnects. Set Auto screen-off to 30 min for a run and put it
   back afterwards. Never send adb input or deep links while the owner is testing by eye.
7. Afterwards stop Metro, the API and Mongo; Docker containers are only ever stopped, never removed.

## Working rules (unchanged)

- **Secrets:** never in chat, git or logs. Tokens live only in Windows user variables, Render / Vercel
  environment variables or EAS secrets. `google-services.json` is ignored by git and `.easignore`.
- **Production checks:** disposable mail.tm accounts only, never real users; post, verify and delete
  within minutes; clean up before stopping, even when a check fails (unless the item is evidence that
  is still needed); confirm with a fresh throwaway viewer that the feeds show no test post.
- **Branches:** one branch from `main` per item; nothing committed or merged before the owner's OK;
  phone-facing changes get the owner's eye-check on the phone before the merge.
- **Deploys:** server deploys only with the owner's OK; confirm by the `/healthz` SHA (never by
  rate-limit counters); rollback = Render's previous deploy.
- **EAS builds:** only when essential, ask first, report the builds left this month.
- **Settings:** don't change Expo / Sentry / Render dashboard settings without the owner; version stays
  1.0.0 until the store release.
