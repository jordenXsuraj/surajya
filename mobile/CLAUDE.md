# MeetNet mobile app — rules for working in `mobile/`

MeetNet's native app: Expo SDK 57 (React Native 0.86, React 19.2, React Compiler on), TypeScript
strict, expo-router. Android first; iOS must keep working. Also read `AGENTS.md` (Expo's own guidance:
always check the versioned Expo docs, never trust remembered APIs).

## Stack (do not add alternatives)

| Concern | Use |
|---|---|
| Navigation | expo-router (`src/app/`), `Stack.Protected` for auth, `expo-router/js-tabs` for tabs |
| Server state | @tanstack/react-query v5, persisted to MMKV (`src/lib/queryClient.ts`) |
| Client state | zustand (`src/stores/`) |
| HTTP | axios — **only** inside `src/api/client.ts` (ESLint enforces this) |
| Secrets | expo-secure-store (auth token, MMKV key) |
| Cache / storage | react-native-mmkv v4 — one encrypted instance from `src/lib/storage.ts` |
| Lists | @shopify/flash-list |
| Images | expo-image |
| Forms | react-hook-form + zod (`src/lib/validation.ts`); use `useWatch`, not `watch()`, and destructure `formState: { errors, isDirty, … }` at the `useForm` call (React Compiler: reads off `formState` later stay stale). Show server answers from state (or a `Controller`'s `fieldState`), not `setError` + a top-level `firstError(errors)`: `setError` changes the same `errors` object, so the compiler keeps the old message |
| Sheets / keyboard | @gorhom/bottom-sheet, react-native-keyboard-controller |
| Animation | react-native-reanimated 4 (`.get()` / `.set()` on shared values) |
| Icons | react-native-svg, ported path-for-path from the web |

Install packages with `npx expo install <pkg>` (dev tools: `npx expo install <pkg> -- --save-dev`, then
check they landed in `devDependencies`).

One exception: `react-native-screens` is pinned to exactly 4.28.0 and listed in `expo.install.exclude`
(package.json, reason in its `"//"` entry): Expo SDK 57 expects ~4.26, whose cold-start race crashes
the app now and then in its first render (SIGSEGV in `MountingCoordinator::pullTransaction`, fixed in
4.28.0). Drop the pin and the exclude once `npx expo install --check` expects >= 4.28. Changing it
needs a new development build.

**Native modules and the app version.** Any change that adds or upgrades a native module (an
`expo-*` / `react-native-*` package with native code, or a config plugin) must bump the app
`version` in `app.config.ts` (and `app.json`), so EAS Update can never deliver that JS to an older
binary that lacks the native code: with `runtimeVersion: { policy: 'appVersion' }` an update only
reaches binaries of the same version. Say so in the commit / PR message ("native: adds X → version
1.1.0"). **The version-bump-on-native-change rule applies from the first public store release,
once expo-updates / EAS Update is set up. Before that, keep 1.0.0** (still name native changes in
the commit message). Status 9 Oct 2026: `runtimeVersion` is not set and `expo-updates` is not
installed; add `runtimeVersion: { policy: 'appVersion' }` together with `expo-updates` before the
first update is published.

After any dependency version change, restart Metro with `--clear`: a Metro that kept running through
the install served a mix of old and new files ("Tried to register two views with the same name
RNSScrollViewMarker") and the app took ~90 s to start.

## Layout

```
src/app/            routes only (every file is a screen) — mirror the web's URLs
src/api/            client.ts (axios + interceptors), errors.ts (ApiError), endpoints/*.ts,
                    queryKeys.ts, session.ts
src/hooks/          React Query hooks and small UI hooks (useMe, useTabReselect…)
src/components/ui/  design-system primitives (Text, Button, Input, Screen, Avatar, Chip, Toast…)
src/components/     app components (TabBar, CodeInput, CollegeInput, VerifyEmailBanner…)
src/stores/         zustand stores (auth, ui, signupDraft)
src/lib/            pure helpers + data ported from the web (validation, colleges, skills, postTypes)
src/theme/          tokens.ts (colours/spacing/radius/fonts from nexusnetwork/src/index.css), fonts.ts
src/types/          API shapes (user, post, notification, report, api)
src/test/           test helpers (mockApi, fixtures)
```

## Rules

- **Never call axios from a component.** Screens → React Query hook → `src/api/endpoints/*` →
  `request()` in `src/api/client.ts`. Every query key comes from `src/api/queryKeys.ts`.
- **Styling uses tokens only** (`src/theme/tokens.ts`): no raw colours, font names or magic font sizes
  in screens. Custom fonts need the per-weight `fonts.*` family (Android ignores `fontWeight`).
- **Routes mirror the web**: `/verify-email`, `/post/[id]`, `/profile/[id]`, `/compose`… so App Links
  and web URLs map 1:1.
- **Touch and layout**: hit areas ≥ 44 pt (use `touch.min` / `touch.hitSlop`), works at 360 dp width,
  respects safe areas (Screen component / `useSafeAreaInsets`), keyboard never covers the focused input.
- **The web app is the reference** for copy, order of fields, validation messages and behaviour
  (`nexusnetwork/src/...`). Port it; don't invent. Exceptions are deliberate and listed below.
- **Don't change `server/` or `nexusnetwork/`** from mobile work. Server/web changes are separate tasks.
- **Accessibility**: every Pressable has a role and label; form errors use `<Message>` (live region).

## API contract (read before touching the API layer)

- Reference: `server/API_MOBILE.md`; the route code in `server/routes/*.js` is the source of truth.
- **401 = the session is over** → `client.ts` logs out — unless the request was sent with an older
  token (e.g. right after an email change), which must not end the new session. Server trouble
  during the auth check is **503**; 5xx, network errors and timeouts (`ApiError.status === 0`)
  never log out.
- **400 = the request was wrong**: validation errors, malformed ids (`'Invalid ID format'`), upload
  errors (`code: 'FILE_TOO_LARGE' | 'INVALID_FILE_TYPE'`).
- Wrong passwords are **400**, never 401.
- **403 `{ code: 'EMAIL_NOT_VERIFIED' }`** → `client.ts` opens the verify bottom sheet automatically.
- **404 can mean "hidden by a block"** — treat it like not found.
- **User text arrives HTML-escaped** (`<` → `&lt;`): render every user string through
  `decodeEntities()` (`src/lib/text.ts`).
- **Anonymous posts**: never try to identify anonymous authors; `postedBy: null` / `isAuthor` replies
  render as "Anonymous (author)".
- Signup/login return `AuthUser` (id arrays); `GET /users/me` returns populated `following`;
  `PUT /users/me*` return id arrays. Keep the signed-in user as `SessionUser` via `toSessionUser()`.
- Passwords: new passwords ≥ 8 characters (server rule); login accepts any non-empty password.
- Verification codes are strings (leading zeros). Resend waits 60 s after **every** successful send
  (`markCodeSent()`); a too-early resend answers `429 { code: 'RESEND_COOLDOWN', retryAfterSeconds }`.

## Feeds and posts

- Feeds are `useInfiniteQuery` (`src/hooks/useFeed.ts`, keys `['feed', scope, type]`); the single post is
  `['post', id]`. Change posts only through `src/api/postCache.ts` (`updatePost`, `removePosts`,
  snapshots) so every cached copy (all feeds + the post) stays in sync; mutations live in
  `src/hooks/usePostMutations.ts` and are optimistic with rollback.
- `PUT /posts/:id/like` is a **toggle**: likes for one post are sent one at a time (queue in
  `useLike`); never fire them in parallel.
- Home ranking (`src/lib/ranking.ts`) sorts each page as it arrives; never re-sort loaded pages
  (posts would jump). Following stays newest-first.
- FlashList v2 recycles item components: per-item state must use `useRecyclingState(initial, [post._id])`.
- Post overlays (replies sheet, ⋯ menu, report sheet, image viewer, YouTube player) are mounted once
  in `src/app/_layout.tsx` and opened through `usePostUi`; cards only receive the stable
  `PostActions` object from `usePostActions()`.
- Sheets are `BottomSheetModal` driven by `useModalSheet(open, close)` (`src/hooks/useModalSheet.ts`).
  Never call `dismiss()` on a modal that is not showing: @gorhom/bottom-sheet then stays in its
  DISMISSING status and ignores every later `present()` (this is why no post sheet ever opened).
  The hook only dismisses what it presented, treats a swipe-down as dismissed, and makes Android
  back close the sheet. Sheets that can open above the compose modal on iOS pass
  `containerComponent` = `FullWindowOverlay` (see `EmailNotVerifiedSheet`).
- Toasts (`Toast.tsx`) animate with React Native's `Animated` (native driver), not Reanimated: on
  Android a Reanimated `entering` animation or mount-time spring on this root overlay never runs
  while a pushed screen (post, compose) is open, so the toast stayed invisible there. Reanimated
  itself works (feed, pushed screens, modals); don't move root overlays back to `entering`.
  The toast sits above the keyboard; on iOS it is in a `FullWindowOverlay` (above native modals).
- Reanimated / worklets: import hooks under their real names (`useAnimatedStyle`, `useSharedValue`,
  `withSpring`, …) and **never alias them** (`useAnimatedStyle as useAS`): the worklets Babel
  plugin finds worklets by those names, and an aliased callback is not workletized — it crashes at
  runtime ("Tried to synchronously call a Remote Function").
- Images: always through `cloudinaryUrl(url, { width })` (`src/lib/cloudinary.ts`).

## Compose and uploads

- Rules live in `src/lib/compose.ts` (5–1000 characters, image XOR YouTube, tags like the web,
  link https:// prefix) and are unit-tested; the screen only wires them up.
- YouTube links (watch, youtu.be, embed, Shorts, live; www./m./music. hosts) go through
  `getYouTubeId` in `src/lib/youtube.ts`. The server (`server/utils/youtube.js`) and the web
  (`nexusnetwork/src/utils/youtube.js`) use the same rule and test cases; change all three together.
- Photos are compressed on the device before upload (`compressPhoto`: max 1200 px wide, JPEG 0.82,
  which also converts HEIC), so photos over the server's 5 MB limit still work; PDFs over 10 MB
  are refused before upload ("PDF must be under 10 MB").
- Uploads go through `uploadFile` (`src/lib/upload.ts`): progress, `AbortSignal` cancel
  (`UploadCancelled` is not an error to show) and readable error messages.
- The compose form is saved to MMKV on every change (`src/lib/composeDraft.ts`) and cleared after
  posting or discarding. Leaving with content always goes through the "Discard post?" check
  (`usePreventRemove`, covers ✕, Android back and iOS swipe-down).
- No `autoFocus` on a text box inside a `KeyboardAwareScrollView` of a screen that slides in:
  focused mid-transition, it can end up under the keyboard. Focus it on the screen's
  `transitionEnd` event instead (compose does).
- Remote switches from `GET /app/config` live in `useAppConfig` (loaded at start and again when the
  app returns to the front, at most every 30 s; all on, nothing blocking, if the request fails).
  `updateRequired` (installed `nativeApplicationVersion` < `minVersion[platform]`, `src/lib/version.ts`)
  and `maintenance.enabled` cover the app with `src/components/AppGate.tsx`, an overlay above the
  navigator (the navigation state underneath stays). A missing or broken version never blocks.

## Profiles and the follow system

- **Follow is a request** (like a private Instagram account): Follow → the other person accepts or
  rejects. The relation comes from the signed-in user's own lists in `SessionUser`
  (`followingIds`, `followerIds`, `sentRequestIds`, `incomingRequestIds`, `blockedIds`); `GET
  /users/:id` says nothing about it. `src/lib/follow.ts` is the pure state machine (relation →
  button: Follow / Follow back / ⏳ Requested / ✓ Following / Accept + Reject; events; the server's
  "Already following" / "Request already sent" / "User already requested you" settle to the real
  state). Every follow button (profile, people lists, post card Connect) goes through it.
- "Requested" is disabled: the API has no way to withdraw a request.
- Mutations live in `src/hooks/useFollow.ts` (`useFollowActions`, `useBlockUser`,
  `useUnblockUser`, `useReportUser`): optimistic on the session and the cached profile counts,
  rolled back on error, then they invalidate `me`, both people's lists, requests and suggestions.
  Unfollow removes their posts from the Following feed at once; block removes their posts and rows
  everywhere. When a `me` refetch finds a changed following list (accepted on their phone),
  `applyMe` (`src/api/session.ts`) refetches the Following feed; Following, Me and profiles
  refresh `me` when they gain focus.
- `['me', …]` keys (my posts, saved, lists, requests, blocked) sit under `me`: invalidate the user
  alone with `{ queryKey: queryKeys.me, exact: true }`.
- **Post lists**: feeds, my posts (`['me','posts']`, infinite), saved (`['me','saved']`) and a
  user's posts (`['user', id, 'posts']`) are all updated by `src/api/postCache.ts`
  (`isPostListKey`); `updateAuthor` patches my posts and replies after a name or photo change.
- `GET /users/:id/posts` returns at most 50, never anonymous ones, and does not leave out expired
  "today only" posts (`withoutExpired` does).
- **Photos**: pick (`src/lib/pickImage.ts`, shared with compose) → the app's own crop screen
  (`app/crop.tsx`, 1:1 or 3:1, `src/lib/crop.ts`) → `ImageManipulator` crop + resize (600×600 /
  1500×500 JPEG, which also converts HEIC) → `uploadFile`. Uploads live in
  `profilePhoto.store`, so the Me tab shows their progress after the crop screen closes.
- **Edit profile** (`app/me/edit.tsx`): sends only the changed fields (`buildProfileUpdate`).
  Usernames are 3–20 of `a-z 0-9 _ .` (`PUT /users/me` refuses more than 20, although the model
  allows 25); an empty username is never sent (old accounts). `PUT /users/me` keeps only media
  types `youtube` and `instagram`, so older `yt-*` items are sent as `youtube`. Media links follow
  `src/lib/media.ts` (web rules; Instagram adds only `instagram.com/<handle>`).
- Log out is in Settings (`signOut()` removes this device's push token first, if Prompt 6
  registered one). The version line uses `expo-application` (`src/lib/appVersion.ts`), a native
  module: development clients built before 7 Oct 2026 lack it and show a red screen in Settings.
- Local test data: `node .maestro/seed.mjs` (profile people, relations; see `.maestro/README.md`).

## Connect, notifications, push, links

- **Connect** (`app/(tabs)/connect.tsx`, `src/components/connect/`): Find (`/users` or `/users/all`,
  20 per page, `usePeopleSearch` infinite, search debounced 300 ms), Suggested (`/users/suggestions`)
  and Activity (requests from `useRequests` + the shared `NotificationList`). Rows are
  `PersonRowItem` (also used by the Prompt 5 lists). The server matches `search` and `skill`
  **literally** and uses only their first 50 characters (`server/utils/searchText.js`): send them
  as typed, never pre-escaped (escaping twice would make "C++" match nothing).
- **Badges** (web `totalBadge`): Connect tab and Activity = `incomingRequestIds.length` (session) +
  unread count (`useActivityCounts`); the Home bell = unread only. One unread-count query
  (`queryKeys.unreadCount`) feeds all of them.
- **Notifications** (`NotificationList`, `src/lib/notifications.ts`): grouped Today / This week /
  Earlier on the client (the server sorts unread first). Opening the list marks all read once the
  fetch has loaded (`useMarkAllReadWhileOpen`); rows keep their unread look for that visit. Tap:
  post types → `/post/<id>`, follow types → `/profile/<sender>` (`notificationTarget`).
- **Push** (`expo-notifications`, `src/lib/push.ts`, `src/hooks/usePushNotifications.ts`): Android
  channel `default` (the server sends no channelId), monochrome `assets/notification-icon.png`
  tinted with the accent. The token is registered on every signed-in start, on return to the front
  and on token change (`POST /users/me/push-token`, device id in SecureStore `push.deviceId`).
  **Every device-token fetch fires `addPushTokenListener`**: `registerForPush` fetches it once and
  passes it to `getExpoPushTokenAsync({ devicePushToken })`, joins a registration already running,
  and the listener re-registers only for a token that really changed (`isNewDevicePushToken`).
  Without that, registering triggered itself (4159 POSTs in minutes, then 429s from the API).
  The server allows 10 registrations per user per hour: after a **429** the app stops registering
  for the rest of the session and tries again on the next app start. A failure that can pass
  (offline, timeout, 5xx, no FCM token yet) is **retried by itself** after 5 s, 30 s, 2 min and
  5 min (`REGISTER_RETRY_MS`), dropped on success or sign-out; no retry after a 4xx. Without it, an
  Allow on the pre-prompt while the API was unreachable left the token unsent until the app came
  back to the front. Dev builds log `[push] registration failed: …` / `[push] trying again in 5 s`.
  **Logout never waits on the
  server**: `signOut()` gives the push-token DELETE at most `SIGN_OUT_PUSH_TIMEOUT_MS` (3 s) and
  signs out locally whatever happens (offline, 401, 5xx, no answer). When that DELETE didn't
  arrive, `settlePushLogout` keeps a **pending removal** in SecureStore (`push.pendingUnregister`:
  userId, deviceId, Expo token; no JWT) and `flushPendingUnregister` sends it as the session-less
  `POST /users/push-token/revoke` on the next start, on reconnect (`onlineManager`) and before
  `login`/`signup`; never against the account signed in now (its registration replaces the entry).
  Only the server's answer changes the record: 2xx clears it; offline, timeouts, 429 and 5xx leave
  it untouched; a refusal (4xx except 408/429) waits 6 h before the next try and drops the record
  after the third (`REVOKE_MAX_REFUSALS`), so a dead route isn't retried on every start.
  Background/killed pushes are drawn by Android without JS, so only the server can stop them.
  Foreground pushes show the app's own banner (`PushBannerHost`, logs `[toast] push …`) and refresh
  the affected queries (`invalidateForPush`); the system alert is off in the foreground. Taps in
  the background or killed state go through `useLastNotificationResponse` → `pushPath(data)`.
- **Pre-prompt** (`app/push-prompt.tsx`): Home opens it ~1 s after coming into view when the system
  can still ask, at most once per session and not again for 14 days after "Not now"
  (`push.promptAt` in MMKV, wiped by logout). Maestro flows answer "Not now"
  (`subflows/dismiss-push-prompt.yaml`).
- **Links** (`src/app/+native-intent.tsx`, `src/lib/deepLinks.ts`): https (apex and www),
  `meetnet://` and `meetnet-dev://` become app paths; the dev client's launcher links go to `/`;
  unknown paths reach `+not-found.tsx`. Signed out, a link (or a tapped push) is kept as
  `pendingPath` in the auth store and opened by `(tabs)/_layout.tsx` after sign-in. Share links are
  always built from `WEB_URL` (`postUrl`, `profileUrl`).
- **Firebase**: `google-services.json` is not in git (public repo). EAS builds get it from the
  `GOOGLE_SERVICES_JSON` file environment variable; a local copy in `mobile/` is ignored by git and
  by `../.easignore`. The FCM V1 service-account key lives only on EAS (credentials), never in the
  repo.

## App identities (APP_VARIANT)

| | development | preview / production |
|---|---|---|
| Name | MeetNet Dev | MeetNet |
| Android package / iOS bundle id | `com.themeetnet.app.dev` | `com.themeetnet.app` |
| Scheme | `meetnet-dev` | `meetnet` |
| App Links / associated domains | none | `https://themeetnet.com` and `www.` — `/post`, `/profile` |
| Launcher icon background | accent red | `#0d0d0d` |

Both can be installed side by side. `app.config.ts` decides from `APP_VARIANT` (unset = production;
typos throw). `npm start` sets `APP_VARIANT=development`; each `eas.json` profile sets its own.
Debug (dev-client) builds allow cleartext HTTP to the local API; preview/production are HTTPS-only.

## Environment

- Only `EXPO_PUBLIC_API_URL` (read as the whole expression `process.env.EXPO_PUBLIC_API_URL`).
  `EXPO_PUBLIC_*` values are bundled in plain text — **never put secrets there**.
- Local: copy `.env.example` → `.env.local`. A dev client loads JS from Metro, so in development
  the local `.env.local` value wins (eas.json only sets it for preview/production builds).
  Restart Metro with `--clear` after changing it.
- USB: `adb reverse tcp:5000 tcp:5000` and `adb reverse tcp:8081 tcp:8081` (both lost on reconnect),
  `EXPO_PUBLIC_API_URL=http://localhost:5000/api`. Don't start Metro with `--localhost` on Windows:
  it then listens on IPv6 `::1` only, adb reverse connects to IPv4 `127.0.0.1`, and the dev client
  fails with "unexpected end of stream on http://localhost:8081".

## Storage

- MMKV is AES-256 encrypted with a random 32-byte key generated on first launch and kept in
  SecureStore (`mmkv.encryptionKey`). **Never create another MMKV instance** — use `getStorage()`,
  `readJson` / `writeJson`.
- Logout wipes the MMKV data (`clearCache()`), the query cache and the token; the key stays.
- Token: SecureStore `auth.token`. Cached user: MMKV `auth.user` (read synchronously at start-up, so
  there is no loading screen; `/users/me` refreshes it in the background).

## Copy that differs from the web on purpose

The web has typos; the app uses the fixed text (the web gets the same fix separately):

| Web | App |
|---|---|
| `Study Meterial` (Post.jsx label, PostCard/Home tag) | `Study Material` / tag `📚 Study Material` |
| `Share what you Have which help other` | `Share what you have that helps others` |
| `Project/Need Partner` | `Project / Need Partner` |
| `Find project teammates,hare what you built` | `Find project teammates, share what you built` |
| `🚀Project/partner` (tag) | `🚀 Project / Partner` |
| `project` (Onboard hero chip) | `🚀 Project` |

## Done means

1. `npm run typecheck`, `npm run lint`, `npm test` all pass (`npm run check` runs all three).
2. `npx expo-doctor` passes.
3. Checked on a real device (or the device checklist for the change is handed over).

## Commands

```bash
npm start                 # Metro for the dev client (APP_VARIANT=development)
npm run android           # same, opens on the connected Android device
npm run check             # typecheck + lint + test
npm run format            # prettier
npx expo-doctor           # dependency / config check
npx eas-cli@latest build --profile development --platform android   # dev client APK
npx eas-cli@latest build --profile preview --platform android       # installable test APK (prod API)
npx eas-cli@latest build:inspect --platform android --profile development --stage archive \
  --output <dir> --force   # see exactly what EAS would upload (governed by ../.easignore)
node .maestro/run.mjs     # Maestro checks on the emulator, verified in the DB (.maestro/README.md)
```

Done for a phone-facing change = the checks above **and** the Maestro run on the `meetnet_oppo`
emulator (never on someone's phone). Add or update a flow in `.maestro/flows/` for new behaviour.

EAS uploads from the repository root; `../.easignore` limits the upload to `mobile/` and repeats
every `.gitignore` rule (an `.easignore` replaces `.gitignore` for EAS). Update it when ignore
rules change.
