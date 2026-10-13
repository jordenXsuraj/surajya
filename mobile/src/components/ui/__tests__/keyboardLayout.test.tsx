import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { createRef, type RefObject } from 'react';
import { Text } from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { Screen } from '@/components/ui/Screen';
import { FOOTER_GAP } from '@/components/ui/KeyboardFooter';
import { KEYBOARD_SETTLE_MS, useKeepFocusedFieldVisible } from '@/hooks/useKeepFocusedFieldVisible';

// Tall keyboards (SwiftKey's toolbar + number row on the owner's OPPO covered almost half the
// screen): Edit profile's "Save changes" sat behind the keyboard, and Compose's text box stayed
// under it after a post type was picked. One approach for every form screen: the action rides on
// top of the keyboard (KeyboardFooter), the scroll view keeps the focused field above that footer
// (bottomOffset = footer height + gap), and a change on the page brings the focused field back.

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('react-native-safe-area-context', () =>
  (jest.requireActual('react-native-safe-area-context/jest/mock') as { default: object }).default,
);

const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } });

describe('Screen with a footer (Edit profile, signup step 2)', () => {
  it('rides on the keyboard and keeps the focused field above it, whatever its height', async () => {
    await render(
      <Screen scroll footer={<Text>Save changes</Text>}>
        <Text>form</Text>
      </Screen>,
    );
    const footer = screen.getByTestId('keyboard-footer');
    expect(screen.getByText('Save changes')).toBeTruthy();
    // the button bar is measured: the scroll view leaves exactly that much room (plus a gap)
    await fireEvent(footer, 'layout', layout(104.4));
    expect(screen.getByTestId('screen-scroll').props.bottomOffset).toBe(105 + FOOTER_GAP);
    await fireEvent(footer, 'layout', layout(156)); // e.g. an error message above the button
    expect(screen.getByTestId('screen-scroll').props.bottomOffset).toBe(156 + FOOTER_GAP);
  });

  it('without a footer: the usual small offset, no keyboard footer', async () => {
    await render(
      <Screen scroll>
        <Text>form</Text>
      </Screen>,
    );
    expect(screen.queryByTestId('keyboard-footer')).toBeNull();
    expect(screen.getByTestId('screen-scroll').props.bottomOffset).toBe(24);
  });
});

describe('useKeepFocusedFieldVisible (Compose: after picking a post type)', () => {
  it('once the keyboard settled, scrolls the focused field back above it', async () => {
    jest.useFakeTimers();
    try {
      const assureFocusedInputVisible = jest.fn();
      const scroll = { current: { assureFocusedInputVisible } } as unknown as RefObject<KeyboardAwareScrollViewRef | null>;
      const { result } = await renderHook(() => useKeepFocusedFieldVisible(scroll));

      result.current();
      expect(assureFocusedInputVisible).not.toHaveBeenCalled(); // the keyboard is still coming up
      jest.advanceTimersByTime(KEYBOARD_SETTLE_MS);
      expect(assureFocusedInputVisible).toHaveBeenCalledTimes(1);

      // quick changes (tapping through the types): one scroll, after the last
      result.current();
      jest.advanceTimersByTime(KEYBOARD_SETTLE_MS / 2);
      result.current();
      jest.advanceTimersByTime(KEYBOARD_SETTLE_MS);
      expect(assureFocusedInputVisible).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('nothing to scroll yet (screen not laid out): no error', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useKeepFocusedFieldVisible(createRef<KeyboardAwareScrollViewRef>()));
      expect(() => {
        result.current();
        jest.advanceTimersByTime(KEYBOARD_SETTLE_MS);
      }).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});
