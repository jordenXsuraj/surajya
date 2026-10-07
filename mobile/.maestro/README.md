# Maestro checks (Prompts 3 and 4)

Automated version of the phone checklists: login, feed, post actions and the whole compose flow.
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
4. Start it headless **on the host GPU**: `emulator -avd meetnet_oppo -no-window -no-audio -no-boot-anim -gpu host -no-snapshot-save`
   (`-gpu auto` picks software rendering when headless: the app then runs so slowly that animations
   and toasts are missed and it can stop responding),
   install the MeetNet Dev APK (`adb -s emulator-5554 install -r meetnet-dev.apk`; the development
   build contains x86_64 libraries).
5. Test files in the emulator's `Download` folder (`adb -s emulator-5554 push <file> /sdcard/Download/`):
   - `meetnet-test-12mb-2031.jpg` (12 MB, 6000×4500, taken 1 Jan 2031)
   - `meetnet-test-iphone-2031.heic` (4032×3024 HEIC, taken 2 Jan 2031)
   - `meetnet-test-small-2031.jpg` (taken 3 Jan 2031)
   - `meetnet-test-notes.pdf` (38 981 bytes) and `meetnet-test-11mb.pdf` (11.5 MB)

   Photos are picked **by their 2031 date** in the system photo picker, so on a real phone a
   personal photo can never be selected.

## Before a run

- Docker Mongo `meetnet-mongo` (db `meetnet_local`) with the seed users (Riya, Kabir, Sneha;
  password `seedpass123`) and `tester@meetnet.local` / `MeetNet-Test-2026`, who follows Riya and
  has Kabir's request pending.
- The local API on port 5000 **without** `CLOUDINARY_*` (uploads then go to `server/uploads`; the
  runner refuses Cloudinary URLs) and Metro on 8081 (`npm run start`).

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
Maestro posts, unblocks the test user it blocks and clears the tester's saved posts.
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
keyboard never covering the text box, the Post button or the toast; how the animations feel.
