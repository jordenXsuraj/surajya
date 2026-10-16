import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { ScreenErrorBoundary } from '@/components/ErrorBoundary';
import { queryClient } from '@/lib/queryClient';
import { usePostUi } from '@/stores/postUi.store';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => true) },
}));

let explode = true;
function Screen() {
  if (explode) throw new Error('TypeError: undefined is not an object (evaluating x.y)');
  return <Text>Home feed</Text>;
}

beforeEach(() => {
  explode = true;
  jest.spyOn(console, 'error').mockImplementation(() => {}); // React and reportError log the crash
});
afterEach(() => jest.restoreAllMocks());

it('a crashing screen shows "Something went wrong" (never the error text)', async () => {
  await render(
    <ScreenErrorBoundary>
      <Screen />
    </ScreenErrorBoundary>,
  );
  expect(screen.getByText('Something went wrong')).toBeTruthy();
  expect(screen.queryByText(/undefined is not an object/)).toBeNull();
});

it('Restart drops cached data and overlays, goes Home and renders the screen again', async () => {
  queryClient.setQueryData(['feed', 'global', 'all'], { pages: [[]], pageParams: [1] });
  usePostUi.getState().openReplies('p1');
  await render(
    <ScreenErrorBoundary>
      <Screen />
    </ScreenErrorBoundary>,
  );
  explode = false;
  fireEvent.press(screen.getByText('Restart'));

  expect(queryClient.getQueryData(['feed', 'global', 'all'])).toBeUndefined();
  expect(usePostUi.getState().repliesPostId).toBeNull();
  expect(router.dismissAll).toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/');
  expect(await screen.findByText('Home feed')).toBeTruthy();
});
