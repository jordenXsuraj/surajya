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
| Forms | react-hook-form + zod (`src/lib/validation.ts`); use `useWatch`, not `watch()` (React Compiler) |
| Sheets / keyboard | @gorhom/bottom-sheet, react-native-keyboard-controller |
| Animation | react-native-reanimated 4 (`.get()` / `.set()` on shared values) |
| Icons | react-native-svg, ported path-for-path from the web |

Install packages with `npx expo install <pkg>` (dev tools: `npx expo install <pkg> -- --save-dev`, then
check they landed in `devDependencies`).

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
- Images: always through `cloudinaryUrl(url, { width })` (`src/lib/cloudinary.ts`).

## App identities (APP_VARIANT)

| | development | preview / production |
|---|---|---|
| Name | MeetNet Dev | MeetNet |
| Android package / iOS bundle id | `com.themeetnet.app.dev` | `com.themeetnet.app` |
| Scheme | `meetnet-dev` | `meetnet` |
| App Links / associated domains | none | `https://themeetnet.com/post`, `/profile`, `/reset-password` |
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
```

EAS uploads from the repository root; `../.easignore` limits the upload to `mobile/` and repeats
every `.gitignore` rule (an `.easignore` replaces `.gitignore` for EAS). Update it when ignore
rules change.
