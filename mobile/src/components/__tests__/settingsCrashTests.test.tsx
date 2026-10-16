import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import SettingsScreen from '@/app/me/settings';
import { useAuthStore } from '@/stores/auth.store';
import { resetAll, sessionUser } from '@/test/helpers';

import appJson from '../../../app.json';
import { buildConfig, type AppVariant } from '../../../app.config';

// Settings shows "Crash reporting test" (a JS error, a native crash) in development and preview
// builds only; with the production profile's app config it must not render.
let mockExpoConfig: unknown = null;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock(
  'react-native-safe-area-context',
  () =>
    (jest.requireActual('react-native-safe-area-context/jest/mock') as { default: object }).default,
);

async function renderSettings(variant: AppVariant) {
  mockExpoConfig = buildConfig(appJson.expo as Parameters<typeof buildConfig>[0], variant);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <SettingsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetAll();
  useAuthStore.getState().signIn('jwt', sessionUser({ termsAcceptedAt: '2026-10-01T00:00:00Z' }));
});

it('production: no "Crash reporting test" section, no test buttons', async () => {
  await renderSettings('production');
  expect(screen.getByText('SUPPORT')).toBeTruthy(); // the screen did render
  expect(screen.queryByText('CRASH REPORTING TEST')).toBeNull();
  expect(screen.queryByText('Send a test JS error')).toBeNull();
  expect(screen.queryByText('Test native crash')).toBeNull();
});

it.each(['preview', 'development'] as const)('%s: the section is there', async (variant) => {
  await renderSettings(variant);
  expect(screen.getByText('CRASH REPORTING TEST')).toBeTruthy();
  expect(screen.getByText('Send a test JS error')).toBeTruthy();
  expect(screen.getByText('Test native crash')).toBeTruthy();
});
