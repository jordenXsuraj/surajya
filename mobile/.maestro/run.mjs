// Runs the Maestro checks for Prompts 3, 4, 5 and 6 against the LOCAL stack on an Android emulator
// (never on someone's phone) and checks every step in the local database and in server/uploads, not
// only on screen. Prompt 6 receives real pushes (local API → Expo → FCM → the emulator).
//
//   node .maestro/run.mjs                        (from mobile/) all steps on emulator-5554
//   node .maestro/run.mjs --only p4-05,p4-06     some steps; --only p3 / p4 / p5 for a group
//   ANDROID_SERIAL=emulator-5556 node .maestro/run.mjs   another emulator
//
// Needs: the device with MeetNet Dev installed, Metro on 8081, Docker Mongo `meetnet-mongo` (db
// meetnet_local), the seed accounts (node .maestro/seed.mjs) and the test files in the device's
// Download folder (README.md). The run starts the local API itself (port 5000, uploads on disk, see
// startLocalApi) and leaves it running afterwards.
// Report: .maestro/reports/<run>/report.md (+ screenshots of failures).
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

import {
  ARJUN_POST_TEXT, BASE_PEOPLE, PROFILE_PEOPLE, SEED_COLLEGE, SEED_UNREAD, TESTER_POSTS, TESTER_PROFILE,
  notificationsScript, relationsScript,
} from './seed-data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '../../server');
const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || join(SERVER, 'uploads');
const API = 'http://127.0.0.1:5000/api';
const TESTER = { email: 'tester@meetnet.local', password: 'MeetNet-Test-2026' };
const SEED_PASSWORD = 'seedpass123';
// p5-19 changes the tester's password to this and the runner changes it back
const TESTER_NEW_PASSWORD = 'MeetNet-Test-2026-b';
const YT_ID = 'dQw4w9WgXcQ';
// Red pixels (quarter-size frames) the heart adds to the middle of the image: ~6000 at full size,
// a few hundred while it pops in; nothing else there is red
const HEART_MIN = 400;

const RUN = `mt${Date.now().toString(36)}`;
const REPORT_DIR = join(HERE, 'reports', RUN);
mkdirSync(REPORT_DIR, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? process.argv[process.argv.indexOf('--only') + 1] ?? '')
  .replace('--only=', '')
  .split(',')
  .filter((s) => /^p\d/.test(s));

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const expect = (cond, message) => { if (!cond) throw new Error(message); };

// Mongo: the Docker container meetnet-mongo, or, with MAESTRO_MONGO_URI set, any mongod reached
// through the mongosh CLI script at MAESTRO_MONGOSH (e.g. a native mongod when Docker doesn't fit
// in memory; README "Without Docker")
const MONGO_URI = process.env.MAESTRO_MONGO_URI;
const mongoshCall = (js) => (MONGO_URI
  ? [process.execPath, [process.env.MAESTRO_MONGOSH, MONGO_URI, '--quiet', '--eval', js]]
  : ['docker', ['exec', 'meetnet-mongo', 'mongosh', 'meetnet_local', '--quiet', '--eval', js]]);

// ── device ────────────────────────────────────────────────────────────────────────────────────
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
const listDevices = () => run('adb', ['devices']).split(/\r?\n/).slice(1).map((l) => l.trim().split(/\s+/)).filter((d) => d[0]);

// The run owns adb: the adb server is restarted so that it sees emulators only (no USB devices at
// all) and restarted normally when the run ends. Maestro refuses every device while any attached
// device is unauthorized, even with --device, and a phone on USB can turn unauthorized mid-run
// (screen locked). Every adb call still names the emulator (-s), every Maestro call --device.
let adbLimited = false;
// Phone mode, only with the owner's OK for that run (README "On a phone"): MAESTRO_PHONE=<serial of
// the USB phone>. adb keeps its normal server (the phone is a USB device), the network is never
// switched off (no airplane mode: those steps fail instead), and app problems are read for
// MeetNet Dev only. Stay-awake and the phone's reverse ports are the caller's to set and restore.
const PHONE = process.env.MAESTRO_PHONE ?? '';
function adbServer(emulatorsOnly) {
  // a wedged adb server (e.g. left by a run that was killed) also hangs kill-server: then end it hard
  const killed = spawnSync('adb', ['kill-server'], { timeout: 15_000 });
  if (killed.status === null) spawnSync('taskkill', ['/IM', 'adb.exe', '/F']);
  // --one-device with a serial no USB device has: the server connects to no USB device (needs the
  // libusb backend on Windows)
  if (emulatorsOnly) spawnSync('adb', ['--one-device', 'emulators-only', 'start-server'], { env: { ...process.env, ADB_LIBUSB: '1' } });
  else spawnSync('adb', ['start-server']);
  adbLimited = emulatorsOnly;
}
// Normal adb server again; a server restart drops the emulator's reverse ports (Metro, local API),
// so they are set up again for using the emulator by hand afterwards
function restoreAdb() {
  if (PHONE) {
    for (const port of ['tcp:8081', 'tcp:5000']) spawnSync('adb', ['-s', PHONE, 'reverse', port, port]);
    return;
  }
  if (!adbLimited) return;
  adbServer(false);
  if (!SERIAL) return;
  spawnSync('adb', ['-s', SERIAL, 'wait-for-device'], { timeout: 30_000 });
  for (const port of ['tcp:8081', 'tcp:5000']) spawnSync('adb', ['-s', SERIAL, 'reverse', port, port]);
}
process.on('exit', restoreAdb);
process.on('SIGINT', () => process.exit(130));

const attached = listDevices();
const wanted = process.env.ANDROID_SERIAL;
if (wanted && !wanted.startsWith('emulator-')) {
  console.error(`ANDROID_SERIAL=${wanted} is not an emulator: these checks only run on an emulator.`);
  process.exit(2);
}
if (PHONE) {
  if (!attached.some((d) => d[0] === PHONE && d[1] === 'device')) {
    console.error(`MAESTRO_PHONE=${PHONE} is not attached and authorized (adb devices).`);
    process.exit(2);
  }
} else adbServer(true);
let SERIAL = PHONE;
for (let i = 0; i < 60 && !SERIAL; i++) { // the emulator reconnects to the new server within seconds
  const ready = listDevices().filter((d) => d[1] === 'device').map((d) => d[0]);
  SERIAL = wanted ? (ready.includes(wanted) ? wanted : '') : ready.includes('emulator-5554') ? 'emulator-5554' : ready.find((s) => s.startsWith('emulator-')) ?? '';
  if (!SERIAL) execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);
}
if (!SERIAL) {
  console.error(`No emulator to run on (attached: ${attached.map((d) => d.join(' ')).join(', ') || 'none'}). Start the emulator${wanted ? '' : ' or set ANDROID_SERIAL'}.`);
  process.exit(2);
}
const others = attached.filter((d) => d[0] !== SERIAL);
if (others.length) {
  console.warn(`⚠️  Other devices attached, ignored: ${others.map((d) => `${d[0]} (${d[1]})`).join(', ')}.${PHONE ? '' : ' adb sees only emulators during the run (restored afterwards);'} running on ${SERIAL}.`);
}
const adb = (...args) => run('adb', ['-s', SERIAL, ...args]);

// Maestro is started straight through Java (maestro.bat would need cmd.exe quoting for "Q&A" etc.)
const MAESTRO_HOME = process.env.MAESTRO_HOME ?? join(homedir(), '.maestro');
const MAESTRO_ENV = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' };
function maestroArgs(flow, env, debugDir) {
  const args = ['--enable-native-access=ALL-UNNAMED', '-classpath', join(MAESTRO_HOME, 'lib', '*'), 'maestro.cli.AppKt',
    'test', '--device', SERIAL, '--debug-output', debugDir, '--flatten-debug-output'];
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(join(HERE, 'flows', flow));
  return args;
}
// Maestro now and then loses its device server while connecting ("Device server died during
// 'deviceInfo'") or its driver does not start in time, before the flow's first command: such a
// run is repeated once
function diedAtStart(r, debugDir) {
  if (r.ok) return false;
  const logFile = join(debugDir, 'maestro.log');
  const text = r.output + (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
  return /Device server died during 'deviceInfo'|Android driver did not start up in time/.test(text);
}
function maestro(flow, env, debugDir) {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync('java', maestroArgs(flow, env, debugDir), { encoding: 'utf8', cwd: HERE, timeout: 15 * 60_000, env: MAESTRO_ENV });
    const result = { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    if (attempt > 1 || !diedAtStart(result, debugDir)) return result;
    log(`  ${flow}: Maestro lost the device while connecting, trying once more`);
  }
}

// First line Maestro marks as failed (and the reason it printed), on one line for the report
function maestroError(output, debugDir) {
  const lines = output.split(/\r?\n/);
  const failed = lines.find((l) => /\.\.\. FAILED\s*$/.test(l));
  const reason = lines.find((l) => /Assertion is false|Element not found|Parsing Failed|DeviceServerDied|Device server died|Exception/.test(l));
  const said = [failed, reason].filter(Boolean).map((l) => l.trim()).join(' — ').replace(/\|/g, '/');
  if (said) return said;
  // Maestro ended without a failed command (it died, timed out, lost the device): the command it
  // was running, Maestro's last error lines and the last lines it printed
  const parts = [];
  const logFile = debugDir && join(debugDir, 'maestro.log');
  if (logFile && existsSync(logFile)) {
    const log = readFileSync(logFile, 'utf8').split(/\r?\n/).filter((l) => !/heartbeat|^\s+at /.test(l));
    const running = log.filter((l) => / RUNNING$/.test(l)).pop();
    if (running) parts.push(`died during: ${running.replace(/^.*?: /, '').replace(/ RUNNING$/, '').slice(0, 80)}`);
    const errors = log.filter((l) => /\[(ERROR|WARN)\]|Exception|timed out|died|refused/i.test(l)).slice(-2);
    parts.push(...errors.map((l) => l.replace(/^[\d:.]+ \[\w+\s*\] [\w.$]+: /, '').slice(0, 200)));
  }
  const tail = lines.map((l) => l.trim()).filter((l) => l && !/^[A-Z]:\\|debug output/i.test(l)).slice(-3);
  parts.push(...tail);
  return parts.join(' — ').replace(/\|/g, '/') || 'Maestro ended without output';
}

// Same as maestro(), without blocking: lets the runner watch the screen while a flow runs
async function maestroAsync(flow, env, debugDir) {
  const once = () => new Promise((resolveRun) => {
    let output = '';
    const child = spawn('java', maestroArgs(flow, env, debugDir), { cwd: HERE, env: MAESTRO_ENV });
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolveRun({ ok: code === 0, output }));
  });
  const first = await once();
  if (!diedAtStart(first, debugDir)) return first;
  log(`  ${flow}: Maestro lost the device while connecting, trying once more`);
  return once();
}

// One raw screen frame (RGBA, no PNG decoding needed): { width, height, top: 0, header, data }
function rawFrame() {
  return new Promise((resolveFrame, reject) => {
    // a capture that hangs (seen once on ColorOS: 13 min) is killed after 15 s instead of stalling the run
    execFile('adb', ['-s', SERIAL, 'exec-out', 'screencap'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 15_000 }, (err, buf) => {
      if (err) return reject(err);
      const width = buf.readUInt32LE(0), height = buf.readUInt32LE(4);
      const header = buf.length - width * height * 4; // 12 or 16 bytes depending on Android version
      resolveFrame({ width, height, top: 0, header, data: buf.subarray(header) });
    });
  });
}
// White pixels: the fixture image's centre square (grows when the image viewer zooms in)
function whitePixels({ data }) {
  let n = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) n++;
  return n;
}
// Where the fixture image (blue 30/80/200) is on screen: { x0, y0, x1, y1 } in pixels, or null.
// Only rows that are mostly blue count, so blue-ish text (avatar initials) does not widen the box.
function blueBox({ width, height, data }) {
  const blue = (i) => Math.abs(data[i] - 30) < 30 && Math.abs(data[i + 1] - 80) < 30 && Math.abs(data[i + 2] - 200) < 30;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 2) {
    const xs = [];
    for (let x = 0; x < width; x += 4) if (blue((y * width + x) * 4)) xs.push(x);
    if (xs.length < width / 4 * 0.4) continue;
    x0 = Math.min(x0, xs[0]); x1 = Math.max(x1, xs.at(-1)); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 - x0 > 200 && y1 - y0 > 200 ? { x0, y0, x1, y1 } : null;
}
// Is the toast (.toast-msg) on this quarter-size RGB frame? A #222 box almost as wide as the screen
// (nothing else in the app is #222; text boxes are #1c1c1c), at least 12 rows high.
function toastBoxIn({ width, height, data }) {
  let run = 0;
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (Math.abs(data[i] - 34) < 4 && Math.abs(data[i + 1] - 34) < 4 && Math.abs(data[i + 2] - 34) < 4) n++;
    }
    run = n > width * 0.6 ? run + 1 : 0;
    if (run >= 12) return true;
  }
  return false;
}

// Has Maestro started the flow's command labelled "… [watch]"? (its log has "<label> RUNNING")
function watchStarted(logFile, state) {
  if (!existsSync(logFile)) return false;
  const size = statSync(logFile).size;
  if (size < state.offset) state.offset = 0; // a retried run starts the log again
  if (size === state.offset) return false;
  const fd = openSync(logFile, 'r');
  const buf = Buffer.alloc(size - state.offset);
  readSync(fd, buf, 0, buf.length, state.offset);
  closeSync(fd);
  state.offset = size;
  return /\[watch\] RUNNING\s*$/m.test(buf.toString('utf8'));
}

// Records every frame the screen shows (screenrecord's raw RGB frames at a quarter of the screen
// size: no video decoder needed, and unlike screencap it misses no frame) and hands each one to
// onFrame as it streams in. Returns stop(), which ends the recording and resolves to the frame count.
function recordFrames(full, onFrame, seconds = 60) {
  if (PHONE) return pollFrames(onFrame, seconds);
  const w = full.width / 4, h = full.height / 4, size = w * h * 3;
  const child = spawn('adb', ['-s', SERIAL, 'exec-out', `screenrecord --output-format=raw-frames --size ${w}x${h} --time-limit ${seconds} -`]);
  let pending = Buffer.alloc(0), frames = 0;
  child.stdout.on('data', (d) => {
    pending = Buffer.concat([pending, d]);
    while (pending.length >= size) {
      onFrame({ width: w, height: h, data: pending.subarray(0, size) });
      frames++;
      pending = pending.subarray(size);
    }
  });
  const closed = new Promise((r) => child.on('close', r));
  return async () => { child.kill(); await closed; return frames; };
}
// The OPPO's screenrecord sends no raw frames: on a phone, screenshots in a loop instead (a few a
// second there), enough for a 2.6 s toast; a 0.7 s heart can fall between two of them
function pollFrames(onFrame, seconds) {
  let stopped = false, frames = 0;
  const until = Date.now() + seconds * 1000;
  const loop = (async () => {
    while (!stopped && Date.now() < until) {
      try { onFrame(quarterOf(await rawFrame())); frames++; } catch { await sleep(200); }
    }
  })();
  return async () => { stopped = true; await loop; return frames; };
}
// A quarter-size RGB frame (what recordFrames hands on) from a full RGBA screencap frame
function quarterOf({ width, height, data }) {
  const w = Math.floor(width / 4), h = Math.floor(height / 4), out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * 4 * width + x * 4) * 4, o = (y * w + x) * 3;
      out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
    }
  }
  return { width: w, height: h, data: out };
}
// The app's JS log while a flow runs, streamed: read back afterwards, a phone's small log buffer
// (256 KiB on the OPPO, full within seconds) has already dropped the lines
function streamAppLog() {
  const lines = [];
  let rest = '';
  const child = spawn('adb', ['-s', SERIAL, 'logcat', '-s', 'ReactNativeJS:I']);
  child.stdout.on('data', (d) => {
    const parts = (rest + d).split(/\r?\n/);
    rest = parts.pop() ?? '';
    lines.push(...parts);
  });
  const closed = new Promise((res) => child.on('close', res));
  return async () => { await sleep(300); child.kill(); await closed; return lines; };
}
// The most red pixels seen in the middle of the fixture image (quarter-size RGB frames)
function redInQuarter({ width, data }, box) {
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * width + x) * 3;
      if (data[i] > 100 && data[i] - data[i + 2] > 60) n++;
    }
  }
  return n;
}
// Runs a flow and records every frame from its command labelled "… [watch]" until 2 s after the
// flow ends; onFrame gets each quarter-size frame. Only from there: watching a whole flow keeps
// the emulator busy enough to slow the app down.
async function recordWatch(flow, env, debugDir, full, onFrame) {
  let done = false;
  const runPromise = maestroAsync(flow, env, debugDir).then((r) => { done = true; return r; });
  const logFile = join(debugDir, 'maestro.log'), logState = { offset: 0 };
  let marked = false;
  while (!done && !(marked = watchStarted(logFile, logState))) await sleep(250);
  if (!marked && !watchStarted(logFile, logState)) return { ...(await runPromise), frames: 0 }; // never got there
  const stop = recordFrames(full, onFrame);
  const m = await runPromise;
  await sleep(2000);
  return { ...m, frames: await stop() };
}
// The double-tap heart: most red pixels seen in the middle of the fixture image (on screen ~0.7 s)
async function watchForRed(flow, env, debugDir) {
  const first = await rawFrame();
  const image = blueBox(first);
  if (!image) throw new Error('fixture image not on screen');
  // the heart pops in the middle of the image: count only the middle 60 % (quarter-size pixels)
  const w = image.x1 - image.x0, h = image.y1 - image.y0;
  const q = (v) => Math.round(v / 4);
  const box = { x0: q(image.x0 + w * 0.2), x1: q(image.x1 - w * 0.2), y0: q(image.y0 + h * 0.2), y1: q(image.y1 - h * 0.2) };
  let before = null, peak = 0;
  const m = await recordWatch(flow, env, debugDir, first, (f) => {
    const n = redInQuarter(f, box);
    if (before === null) before = n; // the first frame: the screen as the double-tap starts
    peak = Math.max(peak, n);
  });
  return { ...m, peak, before: before ?? 0 };
}
// Toasts (on screen for 2.6 s): which ones the app showed comes from logcat (development builds log
// "[toast] <type> <message>"), and the recording shows whether a toast box really was on screen
async function watchForToast(flow, env, debugDir) {
  const full = await rawFrame();
  spawnSync('adb', ['-s', SERIAL, 'logcat', '-c']);
  const stopLog = streamAppLog();
  let visible = false, last = null;
  const m = await recordWatch(flow, env, debugDir, full, (f) => {
    if (!visible && toastBoxIn(f)) visible = true;
    last = f;
  });
  const shown = (await stopLog())
    .map((l) => l.match(/\[toast\] (\w+) (.*)$/)).filter(Boolean).map(([, type, message]) => ({ type, message }));
  mkdirSync(debugDir, { recursive: true });
  writeFileSync(join(debugDir, 'toasts.json'), JSON.stringify({ shown, visible, frames: m.frames }));
  if (!visible && last) writeFileSync(join(debugDir, 'last-recorded-frame.png'), framePng(last)); // copied to the report on failure
  return { ...m, toasts: shown.map((t) => t.type), messages: shown.map((t) => t.message), visible };
}

// Fixture image without image libraries: blue with a white square in the middle
// (red is free for the heart; zooming in makes the white area grow)
function fixturePng(width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const white = Math.abs(x - width / 2) < width / 10 && Math.abs(y - height / 2) < width / 10;
      row.set(white ? [255, 255, 255] : [30, 80, 200], 1 + x * 3);
    }
    rows.push(row);
  }
  return encodePng(width, height, Buffer.concat(rows), 2);
}
// PNG from filtered rows (each row: a 0 filter byte, then the pixels); colorType 2 = RGB, 6 = RGBA
function encodePng(width, height, raw, colorType) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, colorType, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A quarter-size RGB frame as PNG, for the report
function framePng({ width, height, data }) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    data.copy(row, 1, y * width * 3, (y + 1) * width * 3);
    rows.push(row);
  }
  return encodePng(width, height, Buffer.concat(rows), 2);
}

// Network loss for the app: airplane mode AND no route to the local API (adb reverse goes over
// the adb connection, which airplane mode does not cut). Metro (8081) stays so the dev client runs.
function network(online) {
  if (PHONE) {
    // never airplane mode on a real phone (calls, alarms): a step that needs the network gone fails
    if (!online) throw new Error('network loss is not simulated on a phone (it would switch on airplane mode)');
    adb('reverse', 'tcp:5000', 'tcp:5000');
    return;
  }
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', online ? 'disable' : 'enable');
  if (online) adb('reverse', 'tcp:5000', 'tcp:5000');
  else spawnSync('adb', ['-s', SERIAL, 'reverse', '--remove', 'tcp:5000']);
}

// Fast flings for long lists (Maestro's own scroll reads the whole screen after every swipe)
async function fling(times) {
  for (let i = 0; i < times; i++) {
    adb('shell', 'input', 'swipe', '540', '1900', '540', '400', '60');
    await sleep(800); // lets the next page load
  }
}

// ── local API (owned by the run) ──────────────────────────────────────────────────────────────
// The run starts the local API itself, with the settings of a hand-started one (local Mongo,
// uploads on disk, no real emails) and one JWT secret for the whole run (kept in memory only):
// p6-17 / p6-18 restart it with other app-config settings without signing the app out. Whatever
// held port 5000 before (e.g. a start-api window with nodemon) is stopped. The API keeps running
// after the run; its log is the run's api.log.
const API_LOG = join(REPORT_DIR, 'api.log');
const RUN_JWT_SECRET = randomBytes(48).toString('hex');
const RUN_STARTED = new Date().toISOString();
const API_ENV_DROP = ['RESEND_API_KEY', 'RENDER_API_KEY', 'VERCEL_TOKEN', 'EXPO_TOKEN', 'CLOUDINARY_URL',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

// The process tree serving port 5000 (node, its npm / nodemon parents, a start-api PowerShell window),
// never this runner: the API it starts is its own child, so the walk up stops at the runner.
const STOP_API_PS = `
$self = ${process.pid}
$listener = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) { 'free'; exit }
$root = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($root.Name -ne 'node.exe') { "not-node $($root.Name)"; exit }
while ($true) {
  if ($root.ParentProcessId -eq $self) { break }
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($root.ParentProcessId)" -ErrorAction SilentlyContinue
  if (-not $parent -or $parent.ProcessId -eq $self) { break }
  $ours = $parent.Name -in @('node.exe', 'cmd.exe') -or ($parent.Name -eq 'powershell.exe' -and $parent.CommandLine -like '*start-api*')
  if (-not $ours) { break }
  $root = $parent
}
taskkill /PID $root.ProcessId /T /F | Out-Null
"stopped $($root.Name)"`;

const apiUp = async () => (await fetch('http://127.0.0.1:5000/healthz').catch(() => null))?.ok === true;

async function stopLocalApi() {
  const said = run('powershell', ['-NoProfile', '-NonInteractive', '-Command', STOP_API_PS]);
  expect(!said.startsWith('not-node'), `port 5000 is used by something else (${said.slice(9)}): stop it first`);
  for (let i = 0; i < 40 && await apiUp(); i++) await sleep(250);
  return said;
}

/** (Re)starts the local API; `overrides` are extra env vars (APP_MIN_VERSION_ANDROID, APP_MAINTENANCE…). */
async function startLocalApi(overrides = {}) {
  const was = await stopLocalApi();
  const mongoUri = MONGO_URI
    ?? `mongodb://127.0.0.1:${run('docker', ['port', 'meetnet-mongo', '27017']).split(/\r?\n/)[0].split(':').pop()}/meetnet_local`;
  const env = { ...process.env, NODE_ENV: 'development', PORT: '5000', MONGO_URI: mongoUri,
    PUBLIC_APP_URL: 'http://localhost:5173', VERIFICATION_REQUIRED_FROM: RUN_STARTED, JWT_SECRET: RUN_JWT_SECRET, ...overrides };
  for (const k of API_ENV_DROP) delete env[k];
  writeFileSync(API_LOG, `\n── ${new Date().toISOString()} start${Object.keys(overrides).length ? ` with ${Object.keys(overrides).join(', ')}` : ''} (${was})\n`, { flag: 'a' });
  const out = openSync(API_LOG, 'a');
  const child = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: ['ignore', out, out], detached: true, windowsHide: true });
  child.unref();
  closeSync(out);
  // up to 60 s: on a PC short of memory, node took more than 20 s to start
  for (let i = 0; i < 240; i++) {
    if (await apiUp()) return;
    await sleep(250);
  }
  throw new Error(`the local API did not start within 60 s (${API_LOG})`);
}

// ── database and uploaded files ───────────────────────────────────────────────────────────────
const mongo = (js) => {
  const out = run(...mongoshCall(js));
  return out ? JSON.parse(out) : null;
};
const q = (v) => JSON.stringify(v);

async function api(method, path, body, token) {
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (e) {
      // The API keeps idle connections for 65 s and fetch reuses them until just before that: a
      // request after a ~minute-long flow can meet a socket the server is closing (ECONNRESET,
      // nothing was processed). Once more on a new connection.
      const code = e.cause?.code;
      if (attempt === 1 && (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET')) continue;
      // "fetch failed" alone says nothing: name the request and the network error
      throw new Error(`${method} ${path}: ${code ?? e.cause?.message ?? e.message}`);
    }
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.message ?? ''}`);
  return data;
}

const ctx = {};
const postByText = (text) => mongo(`
  const p = db.posts.findOne({ text: ${q(text)} });
  print(p ? JSON.stringify({ ...p, _id: String(p._id), postedBy: String(p.postedBy),
    likes: (p.likes || []).map(String), replies: (p.replies || []).map(r => ({ text: r.text, postedBy: String(r.postedBy) })) }) : 'null');`);
const testerDoc = () => mongo(`
  const u = db.users.findOne({ email: ${q(TESTER.email)} });
  print(JSON.stringify({ savedPosts: (u.savedPosts || []).map(String), blockedUsers: (u.blockedUsers || []).map(String) }));`);
const testerPostCount = () => mongo(`print(db.posts.countDocuments({ postedBy: ObjectId(${q(ctx.testerId)}) }))`);

// http://localhost:5000/uploads/<images|pdfs>/<file> → the file in server/uploads
function uploadedFile(url) {
  const m = String(url).match(/^https?:\/\/(?:localhost|127\.0\.0\.1):5000\/uploads\/(images|pdfs)\/([\w.-]+)$/);
  if (!m) throw new Error(`not a local upload: ${url}`);
  const file = join(UPLOAD_DIR, m[1], m[2]);
  expect(existsSync(file), `file missing on disk: ${m[1]}/${m[2]}`);
  return { file, name: `${m[1]}/${m[2]}` };
}
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
function uploadsSince(since, folder) {
  const dir = join(UPLOAD_DIR, folder);
  // the run's own image fixture (uploaded by setup, maybe moments before the first step) never counts
  return existsSync(dir) ? readdirSync(dir).filter((f) => f !== ctx.fixtureImageFile && statSync(join(dir, f)).mtime >= since) : [];
}

async function expectPost(text, checks = {}) {
  const p = postByText(`Maestro ${RUN} ${text}`);
  expect(p, `no post "${text}" in the database`);
  expect(p.postedBy === ctx.testerId, 'post is not by the tester');
  for (const [k, v] of Object.entries(checks)) {
    expect(JSON.stringify(p[k]) === JSON.stringify(v), `${k} is ${JSON.stringify(p[k])}, expected ${JSON.stringify(v)}`);
  }
  return p;
}
function expectPhoto(p) {
  expect(p.imageUrl, 'post has no imageUrl');
  expect(!p.youtubeUrl, 'post also has a YouTube link');
  const { file, name } = uploadedFile(p.imageUrl);
  const buf = readFileSync(file);
  const size = jpegSize(buf);
  expect(size, 'stored file is not a JPEG (the app should send JPEG, HEIC included)');
  expect(size.width <= 1200, `stored ${size.width}px wide, expected ≤ 1200`);
  expect(buf.length < 5 * 1024 * 1024, `stored ${buf.length} bytes, expected < 5 MB`);
  return `${name}: JPEG ${size.width}×${size.height}, ${(buf.length / 1024).toFixed(0)} KB`;
}
const noPost = (text) => () => {
  expect(!postByText(`Maestro ${RUN} ${text}`), `a post "${text}" was created`);
  return 'no post created';
};

// ── Prompt 5: seed accounts, relations, profiles ──────────────────────────────────────────────
// The tester, the Prompt 3 feed authors and the Prompt 5 profile people (seed-data.mjs), keyed
// riya / arjun / … → ids (ctx.ids) and emails (ctx.emails)
function seedAccounts() {
  const rows = mongo(`print(JSON.stringify(db.users.find({ $or: [{ email: ${q(TESTER.email)} },
    { college: ${q(SEED_COLLEGE)}, email: /^seed-[0-2]-/ }, { email: /^seed-p-/ }] }, { name: 1, email: 1 }).toArray()
    .map(u => ({ id: String(u._id), name: u.name, email: u.email }))))`);
  const ids = {}, emails = {};
  for (const r of rows) {
    const key = r.email === TESTER.email ? 'tester'
      : r.email.startsWith('seed-p-') ? r.email.slice('seed-p-'.length).split('@')[0]
        : BASE_PEOPLE.find((p) => p.name === r.name)?.key;
    if (key) { ids[key] = r.id; emails[key] = r.email; }
  }
  const missing = ['tester', ...BASE_PEOPLE.map((p) => p.key), ...PROFILE_PEOPLE.map((p) => p.key)].filter((k) => !ids[k]);
  expect(!missing.length, `seed accounts missing (${missing.join(', ')}): run node .maestro/seed.mjs`);
  return { ids, emails };
}

/** Every follow / request / block between seed accounts and the tester's profile back to the seed. */
function resetP5() {
  mongo(relationsScript(ctx.ids));
  const { name, year, branch, bio, skills, projects, roadmap, mediaItems } = TESTER_PROFILE;
  // one saved post (the run's fixture), whatever the Prompt 3 save step left
  mongo(`db.users.updateOne({ _id: ObjectId(${q(ctx.ids.tester)}) }, { $set: { ...${q({ name, year, branch, bio, skills, projects, roadmap, mediaItems, avatar: '', coverImage: '' })},
    savedPosts: ${ctx.fixtureId ? `[ObjectId(${q(ctx.fixtureId)})]` : '[]'} } }); print('true')`);
}

/**
 * A token for a seed account (the other side of a request, fixture posts). Seed accounts' tokens are
 * kept for the run (login allows 10 tries per 15 minutes); the tester's password changes in p5-19.
 */
const seedTokens = {};
async function tokenOf(key) {
  if (key !== 'tester' && seedTokens[key]) return seedTokens[key];
  const password = key === 'tester' ? TESTER.password : SEED_PASSWORD;
  const { token } = await api('POST', '/auth/login', { email: ctx.emails[key], password });
  if (key !== 'tester') seedTokens[key] = token;
  return token;
}
const postAs = async (key, text) => (await api('POST', '/posts', { type: 'social', text }, await tokenOf(key)))._id;

const userDoc = (key) => mongo(`
  const u = db.users.findOne({ _id: ObjectId(${q(ctx.ids[key])}) });
  print(JSON.stringify({ name: u.name, username: u.username || '', bio: u.bio || '', year: u.year, branch: u.branch,
    skills: u.skills || [], projects: (u.projects || []).map(p => ({ name: p.name, link: p.link || '' })),
    roadmap: u.roadmap || '', mediaItems: (u.mediaItems || []).map(m => ({ type: m.type, url: m.url })),
    avatar: u.avatar || '', coverImage: u.coverImage || '',
    following: (u.following || []).map(String), followers: (u.followers || []).map(String),
    sentRequests: (u.sentRequests || []).map(String), pendingRequests: (u.pendingRequests || []).map(String),
    blockedUsers: (u.blockedUsers || []).map(String), tokenVersion: u.tokenVersion || 0 }));`);

/** Checks both sides of a relation in the database: a follows b / a asked to follow b. */
function expectRelation(a, b, { follows, requested }) {
  const A = userDoc(a), B = userDoc(b);
  const said = [];
  if (follows !== undefined) {
    const one = A.following.includes(ctx.ids[b]), other = B.followers.includes(ctx.ids[a]);
    expect(one === follows && other === follows, `${a} → ${b}: following ${one}, in their followers ${other}, expected ${follows}`);
    said.push(follows ? `${a} follows ${b}` : `${a} does not follow ${b}`);
  }
  if (requested !== undefined) {
    const one = A.sentRequests.includes(ctx.ids[b]), other = B.pendingRequests.includes(ctx.ids[a]);
    expect(one === requested && other === requested, `${a} → ${b}: sentRequests ${one}, their pendingRequests ${other}, expected ${requested}`);
    said.push(requested ? 'request pending on both sides' : 'no request on either side');
  }
  return said.join('; ');
}

/** A profile photo / cover: a new local upload, a JPEG of exactly the crop's output size. */
function expectProfilePhoto(url, width, height) {
  const { file, name } = uploadedFile(url);
  const buf = readFileSync(file);
  const size = jpegSize(buf);
  expect(size, 'stored file is not a JPEG (the app should send JPEG, HEIC included)');
  expect(size.width === width && size.height === height, `stored ${size.width}×${size.height}, expected ${width}×${height}`);
  expect(buf.length < 5 * 1024 * 1024, `stored ${buf.length} bytes, expected < 5 MB`);
  return `${name}: JPEG ${size.width}×${size.height}, ${(buf.length / 1024).toFixed(0)} KB`;
}

/** p5-19 changes the password and changes it back; a run stopped in between is repaired here. */
async function testerLogin() {
  try {
    return await api('POST', '/auth/login', TESTER);
  } catch (first) {
    const alt = await api('POST', '/auth/login', { email: TESTER.email, password: TESTER_NEW_PASSWORD }).catch(() => { throw first; });
    await api('POST', '/auth/change-password', { currentPassword: TESTER_NEW_PASSWORD, newPassword: TESTER.password }, alt.token);
    log('tester password was left changed by an earlier run: changed back');
    return api('POST', '/auth/login', TESTER);
  }
}

// ── Prompt 6: notifications, push ─────────────────────────────────────────────────────────────
/** Ids of the tester's two seed posts and Arjun's placement post (the notifications point at them). */
function seedPostIds() {
  const ids = {};
  for (const p of TESTER_POSTS) {
    ids[p.key] = mongo(`print(JSON.stringify(String(db.posts.findOne({ postedBy: ObjectId(${q(ctx.ids.tester)}), text: ${q(p.text)} })._id)))`);
  }
  ids['arjun-placement'] = mongo(`print(JSON.stringify(String(db.posts.findOne({ postedBy: ObjectId(${q(ctx.ids.arjun)}), text: ${q(ARJUN_POST_TEXT)} })._id)))`);
  return ids;
}

/** Prompt 5's reset + the tester's notifications back to the seed; likes and replies off their posts. */
function resetP6() {
  resetP5();
  const posts = [ctx.postIds['tester-dsa'], ctx.postIds['tester-project']];
  mongo(`db.posts.updateMany({ _id: { $in: ${q(posts)}.map(id => ObjectId(id)) } }, { $set: { likes: [], replies: [] } }); print('true')`);
  mongo(notificationsScript(ctx.ids, ctx.postIds));
}

const unreadCount = () => mongo(`print(db.notifications.countDocuments({ recipient: ObjectId(${q(ctx.ids.tester)}), read: false }))`);

/** The tester's registered devices, without the tokens themselves (never logged). */
const testerDevices = () => mongo(`print(JSON.stringify((db.users.findOne({ _id: ObjectId(${q(ctx.ids.tester)}) }, { pushTokens: 1 }).pushTokens || [])
  .map(t => ({ platform: t.platform, deviceId: t.deviceId, expo: /^ExponentPushToken\\[.+\\]$/.test(t.token) }))))`);
const clearTesterDevices = () => mongo(`db.users.updateOne({ _id: ObjectId(${q(ctx.ids.tester)}) }, { $set: { pushTokens: [] } }); print('true')`);

/** System notifications MeetNet Dev has posted (title, text, channel, colour, small icon). */
function postedNotifications() {
  const out = run('adb', ['-s', SERIAL, 'shell', 'dumpsys', 'notification', '--noredact'], { maxBuffer: 64 * 1024 * 1024 });
  const records = [];
  let current = null;
  for (const line of out.split(/\r?\n/)) {
    // "NotificationRecord(0x…: pkg=… …: Notification(channel=default … color=0xffa73333 …))": the
    // channel and colour are on this line itself, the extras (title, text) follow below it
    if (/^\s*NotificationRecord\(/.test(line)) {
      current = line.includes(`pkg=${APP_ID} `) ? { channel: null, color: null, icon: null, title: null, text: null } : null;
      if (current) records.push(current);
    }
    if (!current) continue;
    const channel = line.match(/channel=(\S+)/);
    if (channel && current.channel === null) current.channel = channel[1];
    const color = line.match(/\bcolor=0x([0-9a-f]+)/i);
    if (color && current.color === null) current.color = color[1].toLowerCase();
    const icon = line.match(/^\s*icon=(.+)$/);
    if (icon && current.icon === null) current.icon = icon[1].trim();
    const title = line.match(/android\.title=\w+ \((.*)\)$/);
    if (title) current.title = title[1];
    const text = line.match(/android\.text=\w+ \((.*)\)$/);
    if (text) current.text = text[1];
  }
  return records;
}

/** Waits until the system shows a MeetNet notification with this text (a real push takes a few s). */
async function waitForNotification(text, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const found = postedNotifications().find((n) => n.text?.includes(text));
    if (found) return { ...found, seconds: Math.round((Date.now() - t0) / 1000) };
    await sleep(1000);
  }
  throw new Error(`no system notification "${text}" within ${timeoutMs / 1000} s`);
}

/** Waits for a line the app logs (development builds, tag ReactNativeJS). */
async function waitForLog(text, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const log = run('adb', ['-s', SERIAL, 'logcat', '-d', '-s', 'ReactNativeJS:I'], { maxBuffer: 64 * 1024 * 1024 });
    if (log.includes(text)) return { seconds: Math.round((Date.now() - t0) / 1000) };
    await sleep(500);
  }
  throw new Error(`the app did not log "${text}" within ${timeoutMs / 1000} s`);
}
// The push banner's middle on the 1080×2400, 480 dpi emulator: status bar + 6 dp + half the banner
const BANNER_TAP_Y = 246; // measured: the banner spans y 149–343

const appPid = () => spawnSync('adb', ['-s', SERIAL, 'shell', 'pidof', APP_ID], { encoding: 'utf8' }).stdout.trim();

/**
 * Ends the app's process the way Android does for a background app: a kill signal, not force-stop
 * (a force-stopped app gets no FCM messages until it is opened again). `am kill` refuses a
 * process that was in front a moment ago, so the (debug) app kills itself through run-as.
 */
async function killInBackground() {
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await sleep(2000);
  const pid = appPid();
  if (pid) spawnSync('adb', ['-s', SERIAL, 'shell', `run-as ${APP_ID} kill -9 ${pid}`]);
  for (let i = 0; i < 20 && appPid() === pid && pid; i++) await sleep(500);
  expect(!pid || appPid() !== pid, 'the app process is still running after the kill');
}

// The development client's floating tools button sits over the Home bell and the ⚙ on Me, and its
// menu opens by itself on the first start after an install or `pm clear`: both off (and the intro
// done) in its preferences, written through run-as (debug builds only). The app is stopped first so
// it reads them on its next start.
const DEV_MENU_PREFS = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="showFab" value="false" />
    <boolean name="showsAtLaunch" value="false" />
    <boolean name="isOnboardingFinished" value="true" />
</map>
`;
function quietDevClient() {
  adb('shell', 'am', 'force-stop', APP_ID);
  const b64 = Buffer.from(DEV_MENU_PREFS).toString('base64');
  adb('shell', `run-as ${APP_ID} sh -c 'mkdir -p shared_prefs && echo ${b64} | base64 -d > shared_prefs/expo.modules.devmenu.sharedpreferences.xml'`);
  const back = adb('shell', `run-as ${APP_ID} cat shared_prefs/expo.modules.devmenu.sharedpreferences.xml`);
  expect(back.includes('name="showFab" value="false"'), 'could not write the dev menu preferences');
}

const NOTIFICATION_PERMISSION = 'android.permission.POST_NOTIFICATIONS';
const revokeNotifications = () => spawnSync('adb', ['-s', SERIAL, 'shell', 'pm', 'revoke', APP_ID, NOTIFICATION_PERMISSION]);
const notificationsGranted = () =>
  // the runtime-permissions line ("…POST_NOTIFICATIONS: granted=true, flags=[…]"), not the
  // requested-permissions list above it, which has the name alone
  /granted=true/.test(run('adb', ['-s', SERIAL, 'shell', 'dumpsys', 'package', APP_ID]).split(/\r?\n/)
    .find((l) => l.includes(`${NOTIFICATION_PERMISSION}: granted=`)) ?? '');

// ── steps ─────────────────────────────────────────────────────────────────────────────────────
const TYPES = [
  { id: 'placement', re: 'Placement. .*', ph: 'Share placement experience.*' },
  { id: 'qa', re: 'Q&A. .*', ph: 'Ask your question.*' },
  { id: 'study', re: 'Study Material. .*', ph: 'Share notes, PDF link.*' },
  { id: 'project', re: 'Project / Need Partner. .*', ph: 'Describe your project.*' },
  { id: 'social', re: 'Social. .*', ph: 'Share a useful tip.*' },
];

const POSTED = [{ type: 'success', text: 'Posted!' }];

// Prompt 6: every step starts from the seed (relations, the tester's profile, notifications, no
// likes or replies on the tester's posts). Pushes reach the emulator only from p6-11b on: setup
// revokes the notification permission and forgets the tester's devices.
const apiLogSize = () => (existsSync(API_LOG) ? statSync(API_LOG).size : 0);
/** Lines the local API logged since `offset` (morgan: "PUT /api/notifications/…/read 200 …"). */
function apiLogSince(offset) {
  const buf = readFileSync(API_LOG);
  // morgan's dev format colours the status ("…/read \x1b[32m200\x1b[0m"): compare plain text
  // eslint-disable-next-line no-control-regex
  return buf.subarray(offset).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
}
const notificationId = (from, type) => mongo(`print(JSON.stringify(String(db.notifications.findOne({ recipient: ObjectId(${q(ctx.ids.tester)}),
  sender: ObjectId(${q(ctx.ids[from])}), type: ${q(type)} })._id)))`);
const pushDetails = (n) => `system notification "${n.title}: ${n.text}" after ${n.seconds} s, channel ${n.channel}, colour #${(n.color ?? '').slice(-6)}`;
function expectStyledPush(n) {
  expect(n.title === 'MeetNet', `title "${n.title}"`);
  expect(n.channel === 'default', `channel ${n.channel}, expected default`);
  expect((n.color ?? '').endsWith('a73333'), `colour ${n.color}, expected the accent #a73333`);
  return pushDetails(n);
}
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONFIG_WAIT_MS = 31_000; // the app re-reads /app/config on return at most every 30 s

const P6_STEPS = [
  { id: 'p6-01', title: 'Connect → Find: debounced search, My college / All colleges, Senior / contributor badges', flow: 'p6-01-find.yaml',
    beforePrepare: () => { ctx.apiLogAt = apiLogSize(); },
    verify: () => {
      const searches = apiLogSince(ctx.apiLogAt).map((l) => l.match(/GET \/api\/users\?page=1&search=(\w+)/)?.[1]).filter(Boolean);
      expect(searches.includes('adi'), `no search for "adi" (${searches.join(', ') || 'none'})`);
      const partial = searches.filter((q) => q === 'a' || q === 'ad' || q === 'k' || q === 'ku');
      expect(!partial.length, `searched while still typing: ${partial.join(', ')}`);
      return `one request per typed name (${[...new Set(searches)].join(', ')}), none for partial input`;
    } },
  { id: 'p6-02', title: 'Find: skill pills (React; C++ only matches C++)', flow: 'p6-02-skills.yaml' },
  { id: 'p6-03', title: 'Find: the next 20 students load at the end of the list', flow: 'p6-03-infinite.yaml',
    beforePrepare: () => { ctx.apiLogAt = apiLogSize(); },
    verify: () => {
      const pages = apiLogSince(ctx.apiLogAt).filter((l) => /GET \/api\/users\?page=2\b/.test(l)).length;
      expect(pages >= 1, 'no request for page 2 in the API log');
      return 'GET /api/users?page=2 requested by scrolling (no button)';
    } },
  { id: 'p6-04', title: 'Find: Follow → "Requested"', flow: 'p6-04-follow-find.yaml',
    toasts: [{ type: 'success', text: 'Request sent to Varun' }],
    verify: () => expectRelation('tester', 'varun', { requested: true, follows: false }) },
  { id: 'p6-05', title: 'Suggested: cards; Follow → "Requested"', flow: 'p6-05-suggested.yaml',
    toasts: [{ type: 'success', text: 'Request sent to Ishaan' }],
    verify: () => expectRelation('tester', 'ishaan', { requested: true, follows: false }) },
  { id: 'p6-06', title: 'Activity: badges (requests + unread), Accept and Reject in the row', flow: 'p6-06-activity-requests.yaml',
    toasts: [{ type: 'success', text: 'Sana now follows you' }, { type: 'success', text: 'Request removed' }],
    verify: () => `${expectRelation('sana', 'tester', { follows: true, requested: false })}; ${expectRelation('kabir', 'tester', { follows: false, requested: false })}` },
  { id: 'p6-07', title: 'Bell → Notifications: Today / This week / Earlier, every type, all marked read', flow: 'p6-07-notifications.yaml',
    beforePrepare: () => { expect(unreadCount() === SEED_UNREAD, `${unreadCount()} unread before, expected ${SEED_UNREAD}`); },
    verify: () => {
      const n = unreadCount();
      expect(n === 0, `${n} still unread`);
      return `all ${SEED_UNREAD} unread notifications marked read`;
    } },
  { id: 'p6-08', title: 'Tap a reply notification → the post (PUT /notifications/:id/read)', flow: 'p6-08-tap-post.yaml',
    beforePrepare: () => { ctx.apiLogAt = apiLogSize(); ctx.notificationId = notificationId('meera', 'post_replied'); },
    verify: () => {
      const hit = apiLogSince(ctx.apiLogAt).some((l) => l.includes(`PUT /api/notifications/${ctx.notificationId}/read 200`));
      expect(hit, 'no PUT /notifications/:id/read for the tapped notification');
      return 'PUT /api/notifications/<id>/read 200 for the tapped one';
    } },
  { id: 'p6-09', title: 'Tap a follow-request notification → their profile with Accept / Reject', flow: 'p6-09-tap-profile.yaml' },
  { id: 'p6-10', title: 'Pull to refresh shows a new notification (Ishaan likes a post meanwhile)', flow: 'p6-10-refresh.yaml',
    env: () => ({ ISHAAN_TOKEN: seedTokens.ishaan, TESTER_DSA_ID: ctx.postIds['tester-dsa'] }),
    beforePrepare: async () => { await tokenOf('ishaan'); },
    verify: () => {
      const n = mongo(`print(db.notifications.countDocuments({ recipient: ObjectId(${q(ctx.ids.tester)}), sender: ObjectId(${q(ctx.ids.ishaan)}), type: 'post_liked' }))`);
      expect(n === 1, `${n} like notifications from Ishaan`);
      return 'the new like notification is in the database and on screen after the pull';
    } },
  { id: 'p6-11', title: 'Fresh install: notifications pre-prompt → "Not now" (no system dialog, no token)', flow: 'p6-11-prompt-not-now.yaml',
    before: () => { adb('shell', 'pm', 'clear', APP_ID); quietDevClient(); clearTesterDevices(); },
    verify: () => {
      expect(!notificationsGranted(), 'the notification permission was granted');
      const d = testerDevices();
      expect(d.length === 0, `${d.length} push tokens registered`);
      return 'permission still not granted; no push token on the server';
    } },
  { id: 'p6-11b', title: 'Pre-prompt → "Turn on" → Android 13 dialog → Allow → token registered', flow: 'p6-11b-prompt-allow.yaml',
    before: () => { adb('shell', 'pm', 'clear', APP_ID); quietDevClient(); clearTesterDevices(); },
    verify: async () => {
      expect(notificationsGranted(), 'POST_NOTIFICATIONS not granted');
      // the app registers in the background after "Allow" (FCM token, Expo, our API)
      let d = testerDevices();
      for (let i = 0; i < 30 && !d.length; i++) { await sleep(1000); d = testerDevices(); }
      expect(d.length === 1, `${d.length} push tokens, expected 1`);
      expect(d[0].platform === 'android' && d[0].expo && DEVICE_ID.test(d[0].deviceId ?? ''), `token ${q({ ...d[0], deviceId: d[0].deviceId ? 'uuid?' : null })}`);
      return 'POST_NOTIFICATIONS granted; one Expo push token (android, random UUID device id) on the server';
    } },
  // The runner sends the push and taps the banner itself (adb): the banner is on screen for 6 s
  // and on a busy emulator one Maestro screen read can take longer. The app's own log line says
  // when the banner is up; the flow then checks the profile it opened and the badge.
  { id: 'p6-12', title: 'Push while the app is open: in-app banner (no system alert), tap → their profile', prepare: 'p6-12-prepare.yaml', flow: 'p6-12-push-foreground.yaml', needs: 'p6-11b',
    before: async () => {
      spawnSync('adb', ['-s', SERIAL, 'logcat', '-c']);
      await api('POST', `/users/${ctx.ids.tester}/connect`, {}, await tokenOf('ishaan'));
      ctx.banner = await waitForLog('[toast] push Ishaan Verma wants to follow you');
      await sleep(400); // slide-in
      adb('shell', 'input', 'tap', '540', String(BANNER_TAP_Y));
    },
    verify: () => {
      const shown = postedNotifications().filter((n) => n.text?.includes('Ishaan Verma wants to follow you'));
      expect(!shown.length, 'the system also showed the push (foreground pushes should only show the banner)');
      return `${expectRelation('ishaan', 'tester', { requested: true })}; banner "Ishaan Verma wants to follow you" ${ctx.banner.seconds} s after the request, tapped → profile; no system notification`;
    } },
  { id: 'p6-13', title: 'Push in the background: system notification (channel, colour) → tap → the post', prepare: 'p6-prep-home.yaml', flow: 'p6-13-push-background.yaml', needs: 'p6-11b',
    before: async () => {
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      await sleep(1500);
      await api('PUT', `/posts/${ctx.postIds['tester-dsa']}/like`, {}, await tokenOf('arjun'));
      ctx.push = await waitForNotification('Arjun Patil liked your post');
      adb('shell', 'cmd', 'statusbar', 'expand-notifications');
    },
    verify: () => expectStyledPush(ctx.push) },
  // Development builds: the dev launcher reloads the bundle with its own intent after a cold start
  // and drops the notification's tap data, so "lands on the post" can only be seen in a release
  // build (phone eye-check with the preview APK; the JS side is covered by pushTap.test.tsx).
  { id: 'p6-14', title: 'Push with the app killed: delivered, tap cold-starts the app (landing on the post: release build only)', prepare: 'p6-prep-home.yaml', flow: 'p6-14-push-killed.yaml', needs: 'p6-11b',
    before: async () => {
      await killInBackground();
      await api('POST', `/posts/${ctx.postIds['tester-project']}/replies`, { text: `Maestro ${RUN} reply` }, await tokenOf('meera'));
      ctx.push = await waitForNotification('Meera Joshi replied to your post');
      adb('shell', 'cmd', 'statusbar', 'expand-notifications');
    },
    verify: () => `${expectStyledPush(ctx.push)}; the app process was not running` },
  { id: 'p6-15', title: 'Deep links (adb am start): post, profile, home, unknown → not found', prepare: 'p6-prep-home.yaml', flow: 'p6-15-deep-links.yaml',
    before: () => {
      adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `meetnet-dev://post/${ctx.fixtureId}`, APP_ID);
    } },
  { id: 'p6-16', title: 'Link while signed out → sign in → lands on the linked post', flow: 'p6-16-pending-link.yaml' },
  { id: 'p6-17', title: 'Forced update: blocking "Update required" when below minVersion', flow: 'p6-17-update-required.yaml',
    before: () => startLocalApi({ APP_MIN_VERSION_ANDROID: '9.9.9' }),
    after: () => startLocalApi() },
  { id: 'p6-17b', title: '"Check again" after the minimum went back down → the app', flow: 'p6-17b-update-cleared.yaml', needs: 'p6-17' },
  { id: 'p6-18', title: 'Maintenance message when the app returns to the front', prepare: 'p6-prep-home.yaml', flow: 'p6-18-maintenance.yaml',
    before: async () => {
      await startLocalApi({ APP_MAINTENANCE: '1', APP_MAINTENANCE_MESSAGE: 'Maestro maintenance check' });
      await sleep(CONFIG_WAIT_MS);
    },
    after: () => startLocalApi() },
  { id: 'p6-18b', title: 'Maintenance over → "Try again" → the app', flow: 'p6-18b-maintenance-over.yaml', needs: 'p6-18' },
  { id: 'p6-19', title: 'Log out removes this device\'s push token', flow: 'p6-19-logout-token.yaml', needs: 'p6-11b',
    before: () => { ctx.devicesBefore = testerDevices().length; },
    verify: () => {
      const d = testerDevices();
      expect(ctx.devicesBefore >= 1, 'no token was registered before the logout (nothing to check)');
      expect(d.length === 0, `${d.length} tokens left after logout`);
      return `${ctx.devicesBefore} token before, none after (DELETE /users/me/push-token)`;
    } },
].map((step) => ({ ...step, beforePrepare: async () => { resetP6(); await step.beforePrepare?.(); } }));

// ── Prompt 7 (store readiness) ────────────────────────────────────────────────────────────────
const replyAs = async (key, postId, text) => api('POST', `/posts/${postId}/replies`, { text }, await tokenOf(key));
const testerTermsAt = () => mongo(`print(JSON.stringify(db.users.findOne({ _id: ObjectId(${q(ctx.ids.tester)}) }, { termsAcceptedAt: 1 }).termsAcceptedAt ?? null))`);

const P7_STEPS = [
  { id: 'p7-01', title: 'Account without accepted terms: blocking accept-terms screen (Back does nothing) → Agree', flow: 'p7-01-accept-terms.yaml',
    beforePrepare: () => mongo(`print(db.users.updateOne({ _id: ObjectId(${q(ctx.ids.tester)}) }, { $set: { termsAcceptedAt: null } }).modifiedCount)`),
    verify: (start) => {
      const at = testerTermsAt();
      expect(at && new Date(at) >= start, `termsAcceptedAt is ${at}`);
      return `termsAcceptedAt set (${at})`;
    } },
  { id: 'p7-02', title: 'Long-press a reply → Report reply (guidelines, support, 24 h shown)', flow: 'p7-02-report-reply.yaml',
    toasts: [{ type: 'success', text: 'Report submitted' }],
    beforePrepare: async () => { ctx.p7ReplyId = (await replyAs('tanvi', ctx.fixtureId, `Maestro ${RUN} p7 reply to report`))._id; },
    verify: () => {
      const n = mongo(`print(db.reports.countDocuments({ targetType: 'reply', post: ObjectId(${q(ctx.fixtureId)}), replyId: ObjectId(${q(ctx.p7ReplyId)}), reportedBy: ObjectId(${q(ctx.ids.tester)}), reason: 'harassment' }))`);
      expect(n === 1, `${n} matching reply reports`);
      return "one harassment report on Tanvi's reply";
    } },
  { id: 'p7-03', title: "Reply ⋯ → Block: the author's reply leaves the open post at once", flow: 'p7-03-block-from-reply.yaml',
    toasts: [{ type: 'success', text: 'Aditi blocked' }],
    // Aditi: no follow or block with the tester in the baseline (Pooja blocks the tester there,
    // so the server would hide her reply)
    beforePrepare: async () => { await replyAs('aditi', ctx.fixtureId, `Maestro ${RUN} p7 reply to block`); },
    verify: () => {
      expect(userDoc('tester').blockedUsers.includes(ctx.ids.aditi), 'Aditi not in blockedUsers');
      return 'Aditi in blockedUsers';
    } },
  { id: 'p7-04', title: 'Offensive words: warning in compose and the reply box, nothing is sent', flow: 'p7-04-profanity.yaml',
    verify: () => {
      expect(!postByText(`Maestro ${RUN} this is bullshit`), 'the offensive post was created');
      const replies = mongo(`print(db.posts.countDocuments({ 'replies.text': /Maestro ${RUN} you asshole/ }))`);
      expect(replies === 0, `${replies} posts got the offensive reply`);
      return 'no post and no reply with the offensive text';
    } },
  { id: 'p7-05', title: 'Confessions switched off: no 🤫 chip on Home, no Confession type in compose', flow: 'p7-05-confession-off.yaml',
    before: () => startLocalApi({ APP_CONFESSIONS_ANDROID: 'false' }),
    after: () => startLocalApi() },
  { id: 'p7-06', title: 'Offline: banner, a like says "You are offline", an uncached post waits for the connection', flow: 'p7-06-offline.yaml',
    emulatorOnly: 'real network loss (airplane mode) is only simulated on the emulator',
    prepare: 'p7-06-prepare.yaml',
    toasts: [{ type: 'error', text: 'You are offline' }],
    beforePrepare: async () => { ctx.p7OfflinePostId = await postAs('dev', `Maestro ${RUN} p7 offline post`); },
    env: () => ({ OFFLINE_POST_ID: ctx.p7OfflinePostId }),
    before: () => network(false),
    after: () => network(true) },
  // last of Prompt 7: it leaves the app signed out (p5-19 signs in again)
  { id: 'p7-07', title: 'Settings → Delete account (wrong password refused) → deleted, back on the welcome screen', flow: 'p7-07-delete-account.yaml',
    toasts: [{ type: 'success', text: 'Your account was deleted' }],
    beforePrepare: async () => {
      ctx.p7Del = { email: `p7-delete-${RUN.toLowerCase()}@meetnet.local`, password: `Del-${RUN}-pass1` };
      await api('POST', '/auth/signup', { name: 'Delete Me', email: ctx.p7Del.email, password: ctx.p7Del.password,
        college: 'Seed Test College', year: '1st', branch: 'CS', acceptTerms: true });
      mongo(`print(db.users.updateOne({ email: ${q(ctx.p7Del.email)} }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } }).modifiedCount)`);
      const { token } = await api('POST', '/auth/login', { email: ctx.p7Del.email, password: ctx.p7Del.password });
      await api('POST', '/posts', { type: 'social', text: `Maestro ${RUN} p7 post to delete` }, token);
    },
    env: () => ({ DEL_EMAIL: ctx.p7Del.email, DEL_PASSWORD: ctx.p7Del.password }),
    verify: () => {
      const users = mongo(`print(db.users.countDocuments({ email: ${q(ctx.p7Del.email)} }))`);
      const posts = mongo(`print(db.posts.countDocuments({ text: ${q(`Maestro ${RUN} p7 post to delete`)} }))`);
      expect(users === 0 && posts === 0, `${users} accounts and ${posts} posts left`);
      return 'account and its post deleted';
    } },
].map((step) => ({ ...step, beforePrepare: async () => { resetP5(); await step.beforePrepare?.(); } }));

const STEPS = [
  { id: 'p3-01', title: 'Login (signed out → Home)', flow: 'p3-01-login.yaml' },
  { id: 'p3-02', title: 'Home feed scrolls to the end', flow: 'p3-02-feed-scroll.yaml',
    prepare: 'p3-02-prepare.yaml', before: () => fling(60),
    verify: () => `${mongo(`print(db.posts.countDocuments({ college: 'Seed Test College', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }))`)} posts in the tester's college feed` },
  { id: 'p3-03', title: 'Following tab: followed people only', flow: 'p3-03-following.yaml' },
  { id: 'p3-04', title: 'Like', flow: 'p3-04-like.yaml',
    verify: () => { expect(postByText(ctx.fixtureText).likes.includes(ctx.testerId), 'tester not in likes'); return 'likes contains the tester'; } },
  { id: 'p3-05', title: 'Unlike', flow: 'p3-05-unlike.yaml', needs: 'p3-04',
    verify: () => { expect(!postByText(ctx.fixtureText).likes.includes(ctx.testerId), 'tester still in likes'); return 'tester removed from likes'; } },
  { id: 'p3-06', title: 'Reply', flow: 'p3-06-reply.yaml',
    verify: () => {
      const r = postByText(ctx.fixtureText).replies.find((x) => x.text === `Maestro ${RUN} reply`);
      expect(r && r.postedBy === ctx.testerId, 'reply not saved'); return 'reply saved by the tester';
    } },
  { id: 'p3-07', title: 'Save from ⋯ menu', flow: 'p3-07-save.yaml', toasts: [{ type: 'success', text: 'Saved!' }],
    verify: () => { expect(testerDoc().savedPosts.includes(ctx.fixtureId), 'not in savedPosts'); return 'post in savedPosts'; } },
  { id: 'p3-08', title: 'Report (spam)', flow: 'p3-08-report.yaml',
    verify: () => {
      const n = mongo(`print(db.reports.countDocuments({ post: ObjectId(${q(ctx.fixtureId)}), reportedBy: ObjectId(${q(ctx.testerId)}), reason: 'spam' }))`);
      expect(n === 1, `${n} matching reports`); return 'one spam report by the tester';
    } },
  { id: 'p3-09', title: 'Block author (Sneha)', flow: 'p3-09-block.yaml', toasts: [{ type: 'success', text: 'Sneha blocked' }],
    verify: () => { expect(testerDoc().blockedUsers.includes(ctx.snehaId), 'Sneha not in blockedUsers'); return 'Sneha in blockedUsers'; } },
  { id: 'p3-10', title: 'Delete own post', flow: 'p3-10-delete.yaml', toasts: [{ type: 'success', text: 'Deleted' }],
    verify: () => { expect(!postByText(ctx.ownText), 'post still exists'); return 'post removed'; } },
  { id: 'p3-11', title: 'Double-tap like: heart animates on Home', flow: 'p3-11-heart-tap.yaml',
    prepare: 'p3-11-heart-home.yaml', watchRed: true,
    verify: () => {
      expect(postByText(ctx.imageText).likes.includes(ctx.testerId), 'double-tap did not like the post');
      expect(ctx.heartPeak - ctx.heartBefore > HEART_MIN, `no heart on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels over ${ctx.heartFrames} frames)`);
      return `liked; heart seen on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels)`;
    } },
  { id: 'p3-12', title: 'Double-tap heart animates on the post screen (pushed)', flow: 'p3-11-heart-tap.yaml',
    // not liked before the post screen opens, so the database shows whether the double-tap counted
    beforePrepare: () => mongo(`print(db.posts.updateOne({ _id: ObjectId(${q(ctx.imagePostId)}) }, { $pull: { likes: ObjectId(${q(ctx.testerId)}) } }).modifiedCount)`),
    prepare: 'p3-12-heart-post.yaml', watchRed: true,
    verify: () => {
      expect(postByText(ctx.imageText).likes.includes(ctx.testerId), 'the double-tap did not like the post (not recognised as a double-tap)');
      expect(ctx.heartPeak - ctx.heartBefore > HEART_MIN, `liked, but no heart on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels over ${ctx.heartFrames} frames)`);
      return `liked; heart seen on the image (${ctx.heartBefore} → ${ctx.heartPeak} red pixels)`;
    } },
  { id: 'p3-13', title: 'Image viewer (Modal): double-tap zooms in', flow: 'p3-13-viewer-zoom.yaml',
    prepare: 'p3-13-viewer-open.yaml',
    before: async () => { ctx.whiteBefore = whitePixels(await rawFrame()); },
    after: async () => { await sleep(600); ctx.whiteAfter = whitePixels(await rawFrame()); },
    verify: () => {
      const ratio = ctx.whiteAfter / Math.max(1, ctx.whiteBefore);
      expect(ratio > 2, `white area ${ctx.whiteBefore} → ${ctx.whiteAfter} (×${ratio.toFixed(1)}), expected the zoom to grow it`);
      return `white square ${ctx.whiteBefore} → ${ctx.whiteAfter} pixels (×${ratio.toFixed(1)})`;
    } },

  ...TYPES.map((t, i) => ({
    id: `p4-01${String.fromCharCode(97 + i)}`, title: `Compose: ${t.id} post`, flow: 'p4-01-compose-type.yaml', toasts: POSTED,
    env: { TYPE_RE: t.re, PLACEHOLDER_RE: t.ph, TYPE_WORD: t.id },
    verify: async () => { await expectPost(`${t.id} post`, { type: t.id, isAnonymous: false }); return `type ${t.id}, named`; },
  })),
  { id: 'p4-02', title: 'Confession is anonymous (form + feed)', flow: 'p4-02-confession.yaml', toasts: POSTED,
    verify: async () => { await expectPost('confession post', { type: 'confession', isAnonymous: true }); return 'type confession, isAnonymous true'; } },
  { id: 'p4-03', title: 'Anonymous + Today Only', flow: 'p4-03-anon-today.yaml', toasts: POSTED,
    verify: async () => {
      const p = await expectPost('anonymous today post', { type: 'social', isAnonymous: true });
      const h = (new Date(p.expiresAt) - new Date(p.createdAt)) / 3600e3;
      expect(Math.abs(h - 24) < 0.1, `expires after ${h.toFixed(2)} h`); return `isAnonymous true, expires after ${h.toFixed(1)} h`;
    } },
  { id: 'p4-04', title: 'Text limits (5 min, 1000 max)', prepare: 'p4-04-text-limits.yaml', flow: 'p4-04-text-max.yaml',
    // 1100 characters into the focused text box with adb, 100 at a time: Maestro's inputText times
    // out on that many, and one long adb call types faster than the text box keeps up (keys dropped)
    before: async () => {
      ctx.count = testerPostCount();
      for (let i = 0; i < 11; i++) { adb('shell', 'input', 'text', 'x'.repeat(100)); await sleep(400); }
    },
    verify: () => { expect(testerPostCount() === ctx.count, 'a post was created'); return 'nothing posted'; } },
  { id: 'p4-05', title: 'HEIC photo upload', flow: 'p4-05-photo-heic.yaml', toasts: POSTED,
    verify: async () => expectPhoto(await expectPost('heic photo post')) },
  { id: 'p4-06', title: '12 MB photo upload', flow: 'p4-06-photo-12mb.yaml', toasts: POSTED,
    verify: async () => expectPhoto(await expectPost('12mb photo post')) },
  { id: 'p4-07', title: 'Image XOR YouTube', flow: 'p4-07-image-xor-youtube.yaml',
    toasts: [{ type: 'info', text: 'Remove image first' }, { type: 'info', text: 'Remove YouTube video first' }], verify: noPost('xor check') },
  { id: 'p4-08', title: '11 MB PDF refused', flow: 'p4-08-pdf-too-big.yaml', toasts: [{ type: 'error', text: 'PDF must be under 10 MB' }],
    verify: (start) => { const n = uploadsSince(start, 'pdfs').length; expect(n === 0, `${n} PDF uploads`); return 'no PDF uploaded'; } },
  { id: 'p4-09', title: 'Small PDF upload', flow: 'p4-09-pdf-small.yaml', toasts: POSTED,
    verify: async () => {
      const p = await expectPost('pdf post', { pdfName: 'meetnet-test-notes.pdf', pdfSize: 38981 });
      const { file, name } = uploadedFile(p.pdfUrl);
      const buf = readFileSync(file);
      expect(buf.length === 38981 && buf.subarray(0, 5).toString() === '%PDF-', 'stored PDF differs from the test file');
      return `${name}: ${buf.length} bytes, same as the test file`;
    } },
  { id: 'p4-10', title: 'YouTube: channel refused, Shorts posted', flow: 'p4-10-youtube-shorts.yaml', toasts: POSTED,
    verify: async () => { await expectPost('shorts post', { youtubeId: YT_ID, youtubeUrl: `https://youtube.com/shorts/${YT_ID}?feature=share` }); return `youtubeId ${YT_ID}`; } },
  { id: 'p4-11', title: 'Link + tags rules', flow: 'p4-11-link-tags.yaml', toasts: POSTED,
    verify: async () => { await expectPost('link tags post', { link: 'https://github.com/test', tags: ['DSA', 'placement', 'TCS', 'a', 'b'] }); return 'link https://github.com/test, 5 clean tags'; } },
  { id: 'p4-12', title: 'Discard dialog (✕ and Android back)', flow: 'p4-12-discard.yaml', verify: noPost('discard test') },
  { id: 'p4-13', title: 'Draft restored after the app is killed', flow: 'p4-13-draft-restore.yaml',
    toasts: [{ type: 'info', text: 'Draft restored' }],
    verify: noPost('draft text') },
  { id: 'p4-14', title: 'Photo upload with network lost', flow: 'p4-14-upload-offline.yaml',
    before: () => network(false), after: () => network(true),
    verify: (start) => {
      noPost('offline upload post')();
      const n = uploadsSince(start, 'images').length;
      expect(n === 0, `${n} images reached the server`); return 'nothing uploaded, nothing posted';
    } },
  { id: 'p4-15', title: 'Retry upload when network is back, then post', flow: 'p4-15-upload-retry.yaml', toasts: POSTED, needs: 'p4-14',
    verify: async () => expectPhoto(await expectPost('offline upload post')) },
  { id: 'p4-16', title: 'Post with network lost keeps the input', flow: 'p4-16-post-offline.yaml', toasts: [{ type: 'error', text: 'No internet connection' }],
    before: () => network(false), after: () => network(true), verify: noPost('offline post') },
  { id: 'p4-17', title: 'Post again when network is back', flow: 'p4-17-post-retry.yaml', toasts: POSTED, needs: 'p4-16',
    verify: async () => { await expectPost('offline post', { type: 'social' }); return 'post saved'; } },
  { id: 'p4-18', title: 'Attachment chips all on screen; Link and Tags tappable (360 dp)', flow: 'p4-18-attachments-visible.yaml',
    before: () => { ctx.count = testerPostCount(); },
    verify: () => { expect(testerPostCount() === ctx.count, 'a post was created'); return 'Tags and Link fields opened; nothing posted'; } },

  // Prompt 5: every step starts from the seed (relations, the tester's profile, no photos)
  ...[
    { id: 'p5-01', title: 'Me: header, counts, follow requests, sections, Posts / Media / Saved', flow: 'p5-01-me-profile.yaml' },
    { id: 'p5-02', title: 'Profile photo: pick → crop 1:1 → upload with progress', flow: 'p5-02-avatar.yaml',
      toasts: [{ type: 'success', text: 'Profile photo updated' }],
      verify: (start) => {
        const d = userDoc('tester');
        expect(d.avatar, 'no avatar in the database');
        const n = uploadsSince(start, 'images').length;
        expect(n === 1, `${n} images uploaded, expected 1`);
        return expectProfilePhoto(d.avatar, 600, 600);
      } },
    { id: 'p5-03', title: 'Cover from an iPhone HEIC photo: crop 3:1 → upload', flow: 'p5-03-cover-heic.yaml',
      toasts: [{ type: 'success', text: 'Cover updated' }],
      verify: () => {
        const d = userDoc('tester');
        expect(d.coverImage, 'no cover in the database');
        return expectProfilePhoto(d.coverImage, 1500, 500);
      } },
    { id: 'p5-04', title: 'Edit profile: every kind of field saved; my post shows the new name', flow: 'p5-04-edit-save.yaml',
      toasts: [{ type: 'success', text: 'Profile updated' }],
      beforePrepare: async () => { await postAs('tester', `Maestro ${RUN} p5 own post`); },
      verify: () => {
        const d = userDoc('tester');
        const media = [{ type: 'instagram', url: 'https://www.instagram.com/meetnet.tester/' }, { type: 'instagram', url: 'instagram.com/maestro.test' }];
        const wrong = [
          [d.name === 'Tester Maestro', `name "${d.name}"`],
          [d.bio === `Maestro ${RUN} bio`, `bio "${d.bio}"`],
          [d.year === '2nd', `year ${d.year}`],
          [d.skills.includes('Python') && d.skills.includes('Maestro skill') && !d.skills.includes('DSA'), `skills ${d.skills.join(', ')}`],
          [q(d.projects) === q([{ name: 'Maestro project', link: 'github.com/maestro/test' }]), `projects ${q(d.projects)}`],
          [d.roadmap === 'Maestro roadmap', `roadmap "${d.roadmap}"`],
          [q(d.mediaItems) === q(media), `media ${q(d.mediaItems)}`],
        ].filter(([ok]) => !ok).map(([, m]) => m);
        expect(!wrong.length, wrong.join('; '));
        return 'name, bio, year, skills (+suggestion, +own, −one), projects (−1, +1), roadmap, media (−video, +Instagram) as typed';
      } },
    { id: 'p5-05', title: 'Edit profile: Save off until changed, username rules, taken username, bio 250, bad link, discard', flow: 'p5-05-edit-validation.yaml',
      verify: () => {
        const d = userDoc('tester');
        expect(d.bio === TESTER_PROFILE.bio && d.username === ctx.testerUsername, `profile changed: bio "${d.bio}", username "${d.username}"`);
        return 'nothing saved';
      } },
    { id: 'p5-06', title: 'My Following / Followers lists, search, "Follow back"', flow: 'p5-06-my-lists.yaml' },
    { id: 'p5-07', title: "Arjun's profile: badges, sections, posts without the anonymous one, media", flow: 'p5-07-other-profile.yaml',
      verify: () => {
        const n = mongo(`print(db.posts.countDocuments({ postedBy: ObjectId(${q(ctx.ids.arjun)}), isAnonymous: true }))`);
        expect(n >= 1, 'Arjun has no anonymous post in the database (the check would mean nothing)');
        return `Arjun has ${n} anonymous post(s) in the database; not shown on his profile`;
      } },
    { id: 'p5-08', title: 'Follow → "Requested" (request sent)', flow: 'p5-08-follow-request.yaml',
      toasts: [{ type: 'success', text: 'Request sent to Ishaan' }],
      verify: () => expectRelation('tester', 'ishaan', { requested: true, follows: false }) },
    { id: 'p5-09', title: 'Request accepted on the other side → "Following" and their post in Following, no pull-to-refresh', prepare: 'p5-09-requested.yaml', flow: 'p5-09-accepted.yaml',
      beforePrepare: async () => { await postAs('tanvi', `Maestro ${RUN} tanvi post`); },
      before: async () => { await api('POST', `/users/${ctx.ids.tester}/accept`, {}, await tokenOf('tanvi')); },
      verify: () => expectRelation('tester', 'tanvi', { follows: true, requested: false }) },
    { id: 'p5-10', title: 'Accept a request on their profile → "Follow back"', flow: 'p5-10-accept.yaml',
      toasts: [{ type: 'success', text: 'Rohan now follows you' }],
      verify: () => expectRelation('rohan', 'tester', { follows: true, requested: false }) },
    { id: 'p5-11', title: 'Reject a request in Follow requests', flow: 'p5-11-reject.yaml',
      toasts: [{ type: 'success', text: 'Request removed' }],
      verify: () => expectRelation('kabir', 'tester', { requested: false, follows: false }) },
    { id: 'p5-12', title: 'Unfollow (confirm) → their post leaves Following without refresh', flow: 'p5-12-unfollow.yaml',
      toasts: [{ type: 'success', text: 'Unfollowed Meera' }],
      beforePrepare: async () => { await postAs('meera', `Maestro ${RUN} meera post`); },
      verify: () => expectRelation('tester', 'meera', { follows: false }) },
    { id: 'p5-13', title: 'Report a user (harassment)', flow: 'p5-13-report-user.yaml',
      toasts: [{ type: 'success', text: 'Report submitted' }],
      verify: () => {
        const n = mongo(`print(db.reports.countDocuments({ targetType: 'user', user: ObjectId(${q(ctx.ids.arjun)}), reportedBy: ObjectId(${q(ctx.ids.tester)}), reason: 'harassment' }))`);
        expect(n === 1, `${n} matching user reports`);
        return 'one harassment report about Arjun by the tester';
      } },
    { id: 'p5-14', title: 'Block from a profile → back, their posts gone from Home without refresh', flow: 'p5-14-block-profile.yaml',
      toasts: [{ type: 'success', text: 'Nikhil blocked' }],
      beforePrepare: async () => { await postAs('nikhil', `Maestro ${RUN} nikhil post`); },
      verify: () => {
        expect(userDoc('tester').blockedUsers.includes(ctx.ids.nikhil), 'Nikhil not in blockedUsers');
        return `Nikhil blocked; ${expectRelation('nikhil', 'tester', { follows: false })}`;
      } },
    { id: 'p5-15', title: 'Settings → Blocked users → Unblock', flow: 'p5-15-unblock.yaml',
      toasts: [{ type: 'success', text: 'Dev unblocked' }],
      verify: () => { expect(!userDoc('tester').blockedUsers.includes(ctx.ids.dev), 'Dev still blocked'); return 'Dev no longer in blockedUsers'; } },
    { id: 'p5-16', title: '"This profile isn\'t available" (blocked either way)', flow: 'p5-16-not-available.yaml' },
    { id: 'p5-17', title: 'A link to my own profile opens Me', flow: 'p5-17-own-profile.yaml' },
    { id: 'p5-18', title: 'Settings: email, version + build, Terms page, system settings, support without a mail app', flow: 'p5-18-settings.yaml',
      toasts: [{ type: 'info', text: 'No email app found' }] },
    { id: 'p5-20', title: 'Share profile: Android share sheet with the profile link', flow: 'p5-20-share-profile.yaml' },
    { id: 'p5-21', title: 'Log out from Settings', flow: 'p5-21-logout.yaml' },
    // last: changing the password back (runner) ends the app's session, so nothing may follow it
    // (p5-19 itself signs in when the app is signed out)
    { id: 'p5-19', title: 'Change password (wrong current refused; still signed in)', flow: 'p5-19-change-password.yaml',
      toasts: [{ type: 'success', text: 'Password changed' }],
      beforePrepare: () => { ctx.pwChanged = false; ctx.tokenVersion = userDoc('tester').tokenVersion; },
      after: async () => {
        // The new password must work; then it is changed back for the next steps and runs
        const t = await api('POST', '/auth/login', { email: TESTER.email, password: TESTER_NEW_PASSWORD }).catch(() => null);
        if (!t) return;
        ctx.pwChanged = true;
        ctx.tokenVersionAfter = userDoc('tester').tokenVersion;
        await api('POST', '/auth/change-password', { currentPassword: TESTER_NEW_PASSWORD, newPassword: TESTER.password }, t.token);
      },
      verify: () => {
        expect(ctx.pwChanged, 'the new password does not work');
        expect(ctx.tokenVersionAfter === ctx.tokenVersion + 1, `tokenVersion ${ctx.tokenVersion} → ${ctx.tokenVersionAfter}, expected +1`);
        return 'new password works; tokenVersion +1 (other sessions ended); changed back';
      } },
  ].map((step) => ({ ...step, beforePrepare: async () => { resetP5(); await step.beforePrepare?.(); } })),
];
// Prompts 6 and 7 run before p5-19, which has to stay last
STEPS.splice(STEPS.findIndex((s) => s.id === 'p5-19'), 0, ...P6_STEPS, ...P7_STEPS);

// ── setup ─────────────────────────────────────────────────────────────────────────────────────
// Can Maestro reach the emulator? ("Device … was requested, but it is not connected" when adb lists
// an unauthorized device; the emulators-only adb server above prevents that)
function maestroReachesDevice() {
  const r = spawnSync('java', ['--enable-native-access=ALL-UNNAMED', '-classpath', join(MAESTRO_HOME, 'lib', '*'),
    'maestro.cli.AppKt', '--device', SERIAL, 'hierarchy'], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
  });
  return r.status === 0 && !/not connected/i.test(`${r.stdout}${r.stderr}`);
}

function preflight() {
  if (maestroReachesDevice()) return;
  log(`Maestro cannot reach ${SERIAL}; restarting the ${PHONE ? '' : '(emulators-only) '}adb server once`);
  adbServer(!PHONE);
  spawnSync('adb', ['-s', SERIAL, 'wait-for-device'], { timeout: 60_000 });
  if (maestroReachesDevice()) return;
  const usb = listDevices().filter((d) => !d[0].startsWith('emulator-'));
  throw new Error(usb.length
    ? `Maestro cannot reach ${SERIAL}: adb still lists ${usb.map((d) => `${d[0]} (${d[1]})`).join(', ')} — this adb has no libusb backend; unplug the device.`
    : `Maestro cannot reach ${SERIAL}.`);
}

// App crashes and "not responding" the device recorded ("2026-10-06 19:31:42 data_app_anr
// com.themeetnet.app.dev"): listed in the report, so a cold start that open-app.yaml retried is
// not hidden. Each entry names its app (other apps, e.g. the emulator's Gmail, are listed apart).
const APP_ID = 'com.themeetnet.app.dev';
function appProblems() {
  const problems = [];
  for (const tag of ['data_app_native_crash', 'data_app_crash', 'data_app_anr']) {
    const out = run('adb', ['-s', SERIAL, 'shell', 'dumpsys', 'dropbox', '--print', tag], { maxBuffer: 64 * 1024 * 1024 });
    let current = null;
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (data_app_\w+)/);
      if (m) { current = { at: m[1], type: m[2], app: '?' }; problems.push(current); continue; }
      const p = current?.app === '?' && line.match(/^Process: (\S+)/);
      if (p) current.app = p[1];
    }
  }
  // on a phone, other apps' crashes are the owner's business, not the report's
  return problems.filter((x) => !PHONE || x.app === APP_ID).map((x) => `${x.at} ${x.type} ${x.app}`);
}
let problemsBefore = [];

async function setup() {
  preflight();
  problemsBefore = appProblems();
  adb('reverse', 'tcp:5000', 'tcp:5000');
  adb('reverse', 'tcp:8081', 'tcp:8081');
  network(true);
  await startLocalApi();
  log(`local API started by the run (log: ${API_LOG})`);
  // No pushes to the emulator until p6-11b turns them on (the app asks again after p6-11's reset)
  revokeNotifications();
  quietDevClient();
  expect((await fetch('http://127.0.0.1:5000/healthz')).ok, 'local API not running on 5000');
  expect((await (await fetch('http://127.0.0.1:8081/status')).text()).includes('running'), 'Metro not running on 8081');

  const seed = mongo(`print(JSON.stringify(Object.fromEntries(db.users.find({ email: /^seed-[02]-/ }).toArray().map(u => [u.name, { id: String(u._id), email: u.email }]))))`);
  const riya = seed['Riya Deshmukh'], sneha = seed['Sneha Kulkarni'];
  expect(riya && sneha, 'seed users Riya / Sneha missing');
  ctx.snehaId = sneha.id;

  const me = await testerLogin();
  ctx.testerId = String(me.user?._id ?? me.user?.id);
  Object.assign(ctx, seedAccounts());
  ctx.idEnv = Object.fromEntries(Object.entries(ctx.ids).map(([k, id]) => [`${k.toUpperCase()}_ID`, id]));
  ctx.postIds = seedPostIds();
  clearTesterDevices();
  // Every run starts from the seed: who follows / asked / blocked whom, the tester's profile,
  // the tester's notifications
  resetP6();
  ctx.testerUsername = userDoc('tester').username;
  mongo(`print(JSON.stringify(db.reports.deleteMany({ targetType: 'user', reportedBy: ObjectId(${q(ctx.testerId)}) }).deletedCount))`);
  // Uploads must go to local disk: a 1×1 probe through the API, removed again
  const fd = new FormData();
  fd.append('image', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005000157a0c5e10000000049454e44ae426082', 'hex')], { type: 'image/png' }), 'probe.png');
  const probe = await (await fetch(`${API}/posts/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${me.token}` }, body: fd })).json();
  const { file: probeFile } = uploadedFile(probe.url); // throws for a Cloudinary URL
  execFileSync(process.execPath, ['-e', `require('fs').unlinkSync(${q(probeFile)})`]);

  // Leftovers from earlier runs: unblock Sneha, forget saved posts, remove Maestro posts
  await api('POST', `/users/${sneha.id}/unblock`, {}, me.token).catch(() => {});
  mongo(`
    db.users.updateOne({ _id: ObjectId(${q(ctx.testerId)}) }, { $set: { savedPosts: [] } });
    const old = db.posts.find({ text: /^Maestro / }, { _id: 1 }).toArray().map(p => p._id);
    db.reports.deleteMany({ post: { $in: old } });
    print(JSON.stringify(db.posts.deleteMany({ _id: { $in: old } }).deletedCount));`);

  // Fixtures: Riya's post (like/reply/save/report), Sneha's post (block), the tester's own (delete)
  const riyaToken = (await api('POST', '/auth/login', { email: riya.email, password: SEED_PASSWORD })).token;
  const snehaToken = (await api('POST', '/auth/login', { email: sneha.email, password: SEED_PASSWORD })).token;
  ctx.fixtureText = `Maestro ${RUN} fixture post`;
  ctx.ownText = `Maestro ${RUN} delete fixture`;
  ctx.fixtureId = (await api('POST', '/posts', { type: 'social', text: ctx.fixtureText }, riyaToken))._id;
  ctx.blockPostId = (await api('POST', '/posts', { type: 'social', text: `Maestro ${RUN} block fixture` }, snehaToken))._id;
  ctx.ownPostId = (await api('POST', '/posts', { type: 'qa', text: ctx.ownText }, me.token))._id;
  // Riya's post with a solid blue image (double-tap heart checks look for red over blue)
  const img = new FormData();
  img.append('image', new Blob([fixturePng(600, 400)], { type: 'image/png' }), 'fixture.png');
  const { url: imageUrl } = await (await fetch(`${API}/posts/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${riyaToken}` }, body: img })).json();
  ctx.fixtureImageFile = uploadedFile(imageUrl).name.split('/').pop();
  ctx.imageText = `Maestro ${RUN} image fixture`;
  ctx.imagePostId = (await api('POST', '/posts', { type: 'social', text: ctx.imageText, imageUrl }, riyaToken))._id;

  // The app signed in again on this run's API, and the notifications pre-prompt out of the way
  const settle = maestro('setup-settle.yaml', { EMAIL: TESTER.email, PASSWORD: TESTER.password, RUN }, join(REPORT_DIR, 'debug', 'setup'));
  if (!settle.ok) throw new Error(`setup-settle.yaml: ${maestroError(settle.output, join(REPORT_DIR, 'debug', 'setup'))}`);
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────
const results = [];
const startedAt = new Date();
try {
  await setup();
  log(`run ${RUN} on ${SERIAL}: setup done, uploads go to ${UPLOAD_DIR}`);
  for (const step of STEPS) {
    if (only.length && !only.some((o) => step.id.startsWith(o))) continue;
    const r = { id: step.id, title: step.title, flow: step.flow };
    results.push(r);
    // on a phone where p6-11b can't run (ColorOS refuses `pm clear` over adb), the push steps only
    // need what p6-11b leaves behind: this device registered for pushes (the app has the permission)
    const phoneHasDevice = () => PHONE && step.needs === 'p6-11b' && testerDevices().some((d) => d.platform === 'android' && d.expo);
    if (step.needs && results.find((x) => x.id === step.needs)?.result !== 'PASS' && !phoneHasDevice()) { r.result = 'SKIPPED'; r.details = `needs ${step.needs}`; log(step.id, 'SKIPPED'); continue; }
    if (PHONE && step.emulatorOnly) { r.result = 'SKIPPED'; r.details = `emulator only: ${step.emulatorOnly}`; log(step.id, 'SKIPPED'); continue; }
    const debugDir = join(REPORT_DIR, 'debug', step.id);
    const expectedToasts = step.toasts ?? [];
    const start = new Date(Date.now() - 2000);
    const t0 = Date.now();
    let flowEnv = {};
    try {
      await step.beforePrepare?.();
      flowEnv = {
        EMAIL: TESTER.email, PASSWORD: TESTER.password, RUN,
        POST_ID: ctx.fixtureId, BLOCK_POST_ID: ctx.blockPostId, OWN_POST_ID: ctx.ownPostId,
        IMAGE_POST_ID: ctx.imagePostId, ...ctx.idEnv,
        ...(typeof step.env === 'function' ? step.env() : step.env),
      };
      if (step.prepare) {
        const p = maestro(step.prepare, flowEnv, join(debugDir, 'prepare'));
        if (!p.ok) throw new Error(`prepare: ${maestroError(p.output, join(debugDir, 'prepare'))}`);
      }
      await step.before?.();
      let m;
      if (step.watchRed) {
        m = await watchForRed(step.flow, flowEnv, debugDir);
        ctx.heartPeak = m.peak; ctx.heartBefore = m.before; ctx.heartFrames = m.frames;
        // what the screen showed right after the double-tap (kept with the report if the step fails)
        mkdirSync(debugDir, { recursive: true });
        writeFileSync(join(debugDir, 'after-double-tap.png'), execFileSync('adb', ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
      } else if (expectedToasts.length) {
        m = await watchForToast(step.flow, flowEnv, debugDir);
      } else {
        m = maestro(step.flow, flowEnv, debugDir);
      }
      r.screen = m.ok ? 'pass' : 'fail';
      if (!m.ok) r.screenError = maestroError(m.output, debugDir);
      else if (expectedToasts.length) {
        // each expected toast: the first logged one of that type whose text matches
        const found = expectedToasts.map((e) => m.messages.find((msg, i) => m.toasts[i] === e.type && (!e.text || msg.includes(e.text))));
        const missing = expectedToasts.filter((_, k) => !found[k]);
        if (missing.length) {
          r.screen = 'fail';
          r.screenError = `no ${missing.map((e) => `${e.type} toast${e.text ? ` "${e.text}"` : ''}`).join(', ')} (${m.messages.length ? `shown: ${m.messages.join(' / ')}` : 'none shown'})`;
        } else if (!m.visible) {
          r.screen = 'fail';
          r.screenError = `${found.map((f) => `"${f}"`).join(', ')} shown, but no toast box was on screen (${m.frames} frames recorded)`;
        } else r.toast = found.map((f) => `"${f}"`).join(', ');
      }
    } catch (e) {
      r.screen = 'fail'; r.screenError = e.message;
    } finally {
      try { await step.after?.(); } catch (e) { r.screenError = `${r.screenError ?? ''} (restore failed: ${e.message})`; }
    }
    if (r.screen === 'pass' && step.verify) {
      await sleep(1500); // background writes (notifications etc.)
      try { r.db = await step.verify(start); r.dbOk = true; } catch (e) { r.db = e.message; r.dbOk = false; }
    }
    r.result = r.screen === 'pass' && r.dbOk !== false ? 'PASS' : 'FAIL';
    r.seconds = Math.round((Date.now() - t0) / 1000);
    if (r.result === 'FAIL' && existsSync(debugDir)) {
      const shots = readdirSync(debugDir, { recursive: true }).filter((f) => String(f).endsWith('.png'));
      r.screenshots = shots.map((f) => {
        const to = `${step.id}-${String(f).split(/[\\/]/).pop().replace(/[^\w.-]/g, '_')}`;
        copyFileSync(join(debugDir, String(f)), join(REPORT_DIR, to));
        return to;
      });
    }
    log(step.id, r.result, `${r.seconds}s`, r.screenError ?? '', r.db ?? '');
  }
} catch (e) {
  results.push({ id: 'setup', title: 'Setup', result: 'FAIL', details: e.message });
  log('setup failed:', e.message);
} finally {
  try { network(true); } catch {}
}

// ── report ────────────────────────────────────────────────────────────────────────────────────
const count = (s) => results.filter((r) => r.result === s).length;
let model = '?';
try { model = `${adb('shell', 'getprop', 'ro.product.model')}, Android ${adb('shell', 'getprop', 'ro.build.version.release')}, ${adb('shell', 'wm', 'size').replace('Physical size: ', '')}`; } catch {}
const cell = (s) => String(s ?? '–').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
let problemsDuring = [];
try { problemsDuring = appProblems().filter((p) => !problemsBefore.includes(p)); } catch {}
const lines = [
  `# Maestro run ${RUN}`,
  '',
  `${startedAt.toISOString()} · ${SERIAL} (${model}) · uploads: local disk`,
  '',
  `**${count('PASS')} passed · ${count('FAIL')} failed · ${count('SKIPPED')} skipped**`,
  '',
  `App crashes / not responding during the run: ${problemsDuring.filter((p) => p.endsWith(APP_ID)).join(', ') || 'none'}`
    + (problemsDuring.some((p) => !p.endsWith(APP_ID)) ? ` (other apps: ${problemsDuring.filter((p) => !p.endsWith(APP_ID)).join(', ')})` : ''),
  '',
  '| Step | Check | Result | Screen | Database / uploaded file | Time |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.result} | ${r.screen === 'fail' ? `fail: ${cell(r.screenError)}` : r.toast ? `pass, toast ${cell(r.toast)} on screen` : cell(r.screen)} | ${cell(r.db ?? r.details)} | ${r.seconds ?? '–'}s |`),
  '',
  ...results.filter((r) => r.screenshots?.length).map((r) => `- ${r.id} screenshots: ${r.screenshots.join(', ')}`),
];
writeFileSync(join(REPORT_DIR, 'report.md'), lines.join('\n') + '\n');
writeFileSync(join(REPORT_DIR, 'results.json'), JSON.stringify({ run: RUN, device: SERIAL, results }, null, 2));
log(`report: ${join(REPORT_DIR, 'report.md')}`);
process.exitCode = count('FAIL') ? 1 : 0;
