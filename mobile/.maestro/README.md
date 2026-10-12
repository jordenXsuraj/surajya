# Maestro checks (Prompts 3, 4, 5 and 6)

Automated version of the phone checklists: login, feed, post actions, the whole compose flow,
profiles (own profile, photo and cover upload, edit profile, other profiles, the follow system,
lists, report and block, settings, change password, log out) and Prompt 6: Connect (find, skill
pills, paging, suggestions, requests), notifications, **real pushes** in the foreground, background
and killed state, deep links, the forced-update and maintenance screens.
`run.mjs` runs each flow on an Android emulator, turns the network off and on where a step needs
it, and checks the result in the **local database** and in **`server/uploads`** (the local API
stores uploads on disk when Cloudinary is not configured), not only on screen. It only ever talks
to the local stack.

## One-time setup (Windows, no Android Studio)

1. Java 17+ on PATH and the [Maestro CLI](https://maestro.mobile.dev) in `~/.maestro` (or set
   `MAESTRO_HOME`).
2. Android command-line tools in `D:\Android\Sdk` (`ANDROID_HOME`), then with the Android CLI:
   `android --no-metrics sdk install platform-tools emulator "system-images;android-35;google_apis;x86_64"`.
   The emulator needs the Windows Hypervisor Platform (`emulator -accel-check` → "WHPX … usable").
3. An AVD sized like the test phone (OPPO CPH2251: 1080×2400, 480 dpi = 360 dp wide):
   `avdmanager create avd -n meetnet_oppo -k "system-images;android-35;google_apis;x86_64" -d pixel_6`,
   then in `~/.android/avd/meetnet_oppo.avd/config.ini`: `hw.lcd.width=1080`, `hw.lcd.height=2400`,
   `hw.lcd.density=480`, `hw.ramSize=3072`, `hw.keyboard=no` (on-screen keyboard like a phone).
4. Start it headless **on the host GPU**, with explicit DNS servers: `emulator -avd meetnet_oppo -no-window -no-audio -no-boot-anim -gpu host -no-snapshot-save -dns-server 8.8.8.8,1.1.1.1`
   (without `-dns-server` the emulator sometimes boots with working IP but no name resolution: Google
   Play services then gets no FCM token, the app logs `[push] registration failed: E_REGISTRATION_FAILED …
   SERVICE_NOT_AVAILABLE` and every push step fails)
   (`-gpu auto` picks software rendering when headless: the app then runs so slowly that animations
   and toasts are missed and it can stop responding),
   install the MeetNet Dev APK (`adb -s emulator-5554 install -r meetnet-dev.apk`; the development
   build contains x86_64 libraries). The image must have Google Play services (`google_apis` or
   `google_apis_playstore`): pushes arrive through FCM.
5. No mail app on the emulator: `adb -s emulator-5554 shell pm disable-user --user 0 com.google.android.gm`
   (the image's Gmail is not set up and stops responding when Settings → Email support opens it;
   without a mail app the app shows the support address in a toast, which `p5-18` checks).
6. Test files in the emulator's `Download` folder (`adb -s emulator-5554 push <file> /sdcard/Download/`):
   - `meetnet-test-12mb-2031.jpg` (12 MB, 6000×4500, taken 1 Jan 2031)
   - `meetnet-test-iphone-2031.heic` (4032×3024 HEIC, taken 2 Jan 2031)
   - `meetnet-test-small-2031.jpg` (taken 3 Jan 2031)
   - `meetnet-test-notes.pdf` (38 981 bytes) and `meetnet-test-11mb.pdf` (11.5 MB)

   Photos are picked **by their 2031 date** in the system photo picker, so on a real phone a
   personal photo can never be selected.

## Before a run

- Docker Mongo `meetnet-mongo` (db `meetnet_local`) with the seed: `node .maestro/seed.mjs` (local
  only, safe to run again). It creates what is missing: `tester@meetnet.local` / `MeetNet-Test-2026`,
  the feed authors Riya, Kabir and Sneha with ~120 posts, and eight profile people
  (`seed-p-<name>@example.com`, password `seedpass123`) with photos uploaded through the API,
  bios, skills, projects, media and posts. The relations are in `seed-data.mjs`: the tester follows
  Riya, Arjun and Meera (Arjun and Meera follow back), Nikhil follows the tester, Kabir and Rohan
  asked to follow the tester, the tester asked Tanvi, the tester blocked Dev, Pooja blocked the
  tester; Ishaan has an empty profile. Every run (and every Prompt 5 step) puts these relations and
  the tester's profile back first; Prompt 5 steps also give the tester exactly one saved post (the
  run's fixture post), whatever the Prompt 3 save step left. Prompt 6 adds Sana (also asked to
  follow the tester), Aditi, Varun (the only C++), Kunal (PICT) and Neha (COEP), two posts by the
  tester, nine notifications of every type (5 unread; today / this week / earlier) and twelve
  first-year fillers (`seed-f-batchNN@example.com`) so Connect → Find has a second page.
- Metro on 8081 (`npm run start`). **The run starts the local API itself** (port 5000, local
  Mongo, uploads in `server/uploads`, no real emails, one JWT secret for the run) after stopping
  whatever served port 5000 (e.g. a `start-api` window with nodemon). It keeps running after the
  run; its log is `.maestro/reports/<run>/api.log`.

## Run

```sh
cd mobile
node .maestro/run.mjs                 # everything, on emulator-5554
node .maestro/run.mjs --only p4-05    # one step; --only p3 / p4 for a group
ANDROID_SERIAL=emulator-5556 node .maestro/run.mjs   # another emulator
```

Runs go on the emulator, never on someone's phone (`ANDROID_SERIAL` must be an emulator).
Every adb call (`-s`) and Maestro call (`--device`) names the emulator, and for the length of
the run the adb server is restarted to see **emulators only** (`ADB_LIBUSB=1 adb --one-device
emulators-only start-server`): Maestro refuses every device while any attached device is
unauthorized, and a phone on USB can turn unauthorized mid-run (screen locked). Other attached
devices are named in a warning; the normal adb server is started again when the run ends. If a
run is killed hard, `adb kill-server` brings the phone back.

Each run creates its own fixture posts (tagged `Maestro <run id>`), removes the previous run's
Maestro posts and the tester's user reports, puts the seed relations back and clears the tester's
saved posts.

Prompt 5 specifics:

- **The other side** of a follow request (someone accepting on their phone) is played by the runner
  through the API with that seed account's login (`p5-09`); fixture posts by Tanvi, Meera and
  Nikhil show that the Following and Home feeds change without a pull-to-refresh.
- **Photos**: `p5-02` / `p5-03` pick the 2031 test photos, crop them on the app's own crop screen
  (no pinch / drag: the centred crop) and check the stored file is a JPEG of exactly 600×600 /
  1500×500 (the HEIC cover converted on the phone).
- **Change password** (`p5-19`) changes the tester's password to `MeetNet-Test-2026-b`; the runner
  checks it works and changes it back right away (and at the start of the next run, if a run
  stopped in between). The server allows 5 changes per 15 minutes, so run `p5-19` at most twice in
  a row.
- Log out is in Settings now (`subflows/sign-out.yaml`: Me → ⚙ → Log out).

Prompt 6 specifics:

- **Pushes are real**: the runner (or the flow, through `scripts/api.js`) acts as Ishaan, Arjun or
  Meera on the local API; the server sends through Expo → FCM to the emulator. `p6-12` checks the
  in-app banner (logcat `[toast] push …` plus the recording) and that no system notification was
  posted; `p6-13` / `p6-14` read the posted notification from `dumpsys notification` (title,
  channel `default`, accent colour) and tap it in the shade. "Killed" is `am kill` of the app in the
  background, never `force-stop` (a force-stopped app receives no FCM messages).
- **Permission**: setup revokes `POST_NOTIFICATIONS` and forgets the tester's devices, so no push
  reaches the emulator before `p6-11b` allows them. `p6-11` / `p6-11b` clear the app's data
  (`pm clear`) to see the pre-prompt as a new install does. Every other flow answers the pre-prompt
  "Not now" (`subflows/dismiss-push-prompt.yaml`, also run once by `flows/setup-settle.yaml`).
- **App config**: `p6-17` / `p6-18` restart the local API with `APP_MIN_VERSION_ANDROID=9.9.9` /
  `APP_MAINTENANCE=1` and back (same JWT secret, so the app stays signed in); `p6-18` waits 31 s so
  the app re-reads `/app/config` on its return to the front.
- **Killed state (`p6-14`) in a development build**: the push arrives and tapping it cold-starts the
  app, but the dev launcher then reloads the bundle with its own intent and drops the notification's
  tap data, so the app opens on Home. "Lands on the post" can only be checked on a release build (the
  preview APK on a phone); the JS side (tap → pending path → tabs layout) is in `pushTap.test.tsx`.
- `p6-12`, `p6-13`, `p6-14` and `p6-19` need `p6-11b` (a registered device); run them together, e.g.
  `--only p6-11b,p6-12`.
- **Dev client**: its floating tools button (⚙) sits over the Home bell and the ⚙ on Me, and its menu
  opens by itself on the first start after an install or `pm clear`. The runner turns both off (and
  marks its intro done) by writing the dev menu's preferences through `run-as` at setup and after
  each `pm clear` (`quietDevClient`); `subflows/open-app.yaml` still closes the menu if it shows.
  On a phone with the dev build, turn **Tools button** off in the dev menu by hand.

The report goes to `.maestro/reports/<run>/report.md` (git-ignored) with screenshots of failures.

Network-loss steps use airplane mode **and** remove `adb reverse tcp:5000`: the app reaches the
local API through adb, which airplane mode alone does not cut. The runner always restores both.

Things the flows work around on purpose:

- **Keyboard:** never Maestro's `hideKeyboard` (it presses Back when no keyboard is open, which
  closes the screen). `subflows/hide-keyboard.yaml` taps the keyboard's own Back button in the
  navigation bar, which only exists while the keyboard is shown.
- **Short-lived things are not checked by Maestro:** one Maestro screen read takes ~3 s on the
  emulator, longer than a toast (2.6 s) or the double-tap heart (~0.7 s). From the flow command
  labelled `… [watch]` on, the runner records every frame (`screenrecord --output-format=raw-frames`,
  quarter size, no video decoder needed); recording a whole flow would keep the emulator busy
  enough to slow the app down.
  - heart steps count red pixels in the middle of the blue fixture image;
  - steps with `toasts` (type and text) read which toasts the app showed from logcat (development builds log
    `[toast] <type> <message>`, `src/components/ui/Toast.tsx`) and check the recording for the
    toast box, so a toast that is shown but hidden (behind a screen) still fails.
- **Long text:** 1100 characters are typed with `adb shell input text`, 100 at a time
  (Maestro's `inputText` times out on that many, and one long adb call types faster than the
  text box keeps up).
- **Starting the app:** `subflows/open-app.yaml` stops the app before opening the dev-client link:
  opening it while the app runs makes expo-dev-launcher recreate the activity and crash ("App
  react context shouldn't be created before"). `ensure-home.yaml` leaves a pushed screen with
  Back instead of restarting.
  A cold start is tried up to 3 times: now and then the app dies in its first render (SIGSEGV in
  `MountingCoordinator::pullTransaction`, a react-native-screens race fixed upstream in 4.28.0).
  Every app crash and "not responding" during a run is listed at the top of the report.

## Not automated (check by eye on the phone)

Camera permission prompt and taking a photo; how the uploaded photos look; haptics; the phone's own
keyboard never covering the text box, the Post button or the toast; how the animations feel;
pinch and drag on the crop screen (Maestro cannot pinch); a second phone or the web as the other
side of a request (the runner uses the API for that); a push on a real phone and its sound and
icon in the status bar (`server/scripts/sendTestPush.js`); App Links from another app (checked
with `pm get-app-links` on a preview build instead).
