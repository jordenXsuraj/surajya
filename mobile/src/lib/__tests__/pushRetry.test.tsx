import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import PushPromptScreen from '@/app/push-prompt';
import { signOut } from '@/hooks/useAccount';
import { forgetPushRegistration, REGISTER_RETRY_MS, registerForPush } from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, sessionUser, type Reply } from '@/test/helpers';

// "Turn on notifications" → Allow registers this device right away, in the background. When that
// first try can't reach the API (offline, server trouble), it now tries again by itself: before,
// the token stayed unsent until the app went to the background and came back, or restarted.
// A file of its own: a 429 stops this module's registrations for the rest of the file.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));

// The real Screen needs the safe-area and keyboard natives; the prompt's logic is what's tested
jest.mock('@/components/ui', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const rn = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Screen: ({ children }: { children?: import('react').ReactNode }) => createElement(rn.View, null, children),
    Text: (props: object) => createElement(rn.Text, props),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      createElement(rn.Pressable, { accessibilityRole: 'button', onPress }, createElement(rn.Text, null, title)),
  };
});

const HOUR = 60 * 60_000;
const ok: Reply = { status: 200, data: { ok: true } };
const isRegistration = (c: { method?: string; url?: string }) =>
  c.method === 'post' && c.url === '/users/me/push-token';

/** POST /users/me/push-token answers with `replies` in turn (the last one from then on). */
function serverAnswers(...replies: Reply[]) {
  let n = 0;
  const calls = mockApi((c) => (isRegistration(c) ? replies[Math.min(n++, replies.length - 1)] ?? ok : ok));
  return () => calls.filter(isRegistration);
}

async function tapAllow() {
  await render(<PushPromptScreen />);
  await fireEvent.press(screen.getByText('Turn on notifications'));
  await jest.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  resetAll();
  forgetPushRegistration();
  useAuthStore.getState().signIn('jwt-a', sessionUser({ _id: 'a' }));
  jest.useFakeTimers();
});
afterEach(() => {
  forgetPushRegistration();
  jest.useRealTimers();
});

it('Allow on the pre-prompt registers right away, with no restart or return to the front', async () => {
  const sent = serverAnswers(ok);
  await tapAllow();
  expect(sent()).toHaveLength(1);
  expect(JSON.parse(String(sent()[0]?.data))).toMatchObject({
    token: 'ExponentPushToken[test-token]',
    deviceId: expect.any(String),
  });
  expect(router.back).toHaveBeenCalled(); // the prompt closed without waiting for it
  await jest.advanceTimersByTimeAsync(HOUR);
  expect(sent()).toHaveLength(1); // nothing more to do
});

it.each([
  ['the API unreachable (offline, adb reverse gone)', 'network' as const],
  ['no answer in time', 'timeout' as const],
  ['a server error', { status: 503, data: {} }],
])('%s at that moment: it tries again by itself, then stops', async (_name, failure) => {
  const sent = serverAnswers(failure, ok);
  await tapAllow();
  expect(sent()).toHaveLength(1);
  await jest.advanceTimersByTimeAsync((REGISTER_RETRY_MS[0] ?? 0) - 100);
  expect(sent()).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(200);
  expect(sent()).toHaveLength(2); // no AppState change, no restart
  await jest.advanceTimersByTimeAsync(HOUR);
  expect(sent()).toHaveLength(2);
});

it('gives up after the last delay: at most 4 extra requests (the server allows 10 an hour)', async () => {
  const sent = serverAnswers('network');
  await tapAllow();
  await jest.advanceTimersByTimeAsync(REGISTER_RETRY_MS.reduce((a, b) => a + b, 0) + 60_000);
  expect(sent()).toHaveLength(1 + REGISTER_RETRY_MS.length);
  expect(REGISTER_RETRY_MS.length).toBeLessThanOrEqual(4);
  await jest.advanceTimersByTimeAsync(HOUR);
  expect(sent()).toHaveLength(1 + REGISTER_RETRY_MS.length);
});

it('a return to the front that registers in the meantime: the pending retry is dropped', async () => {
  const sent = serverAnswers('network', ok);
  await tapAllow();
  await registerForPush(); // AppState 'active'
  expect(sent()).toHaveLength(2);
  await jest.advanceTimersByTimeAsync(HOUR);
  expect(sent()).toHaveLength(2);
});

it('signing out drops the pending retry', async () => {
  const sent = serverAnswers('network');
  await tapAllow();
  await signOut();
  expect(useAuthStore.getState().status).toBe('signedOut');
  await jest.advanceTimersByTimeAsync(HOUR);
  expect(sent()).toHaveLength(1);
});

// 429 last: it stops this module's registrations for the rest of the file ("app session")
it.each([
  ['400', { status: 400, data: { message: 'Invalid push token' } }],
  ['429', { status: 429, data: { message: 'Too many push token updates. Try again later.' } }],
])('%s: no retry (waiting would not change it)', async (_name, failure) => {
  const sent = serverAnswers(failure);
  await tapAllow();
  await jest.advanceTimersByTimeAsync(HOUR);
  expect(sent()).toHaveLength(1);
});
