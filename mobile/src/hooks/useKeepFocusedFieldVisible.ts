import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/** How long the keyboard takes to (re)appear before the focused field is brought into view. */
export const KEYBOARD_SETTLE_MS = 350;

/**
 * KeyboardAwareScrollView scrolls to a field when it gets the focus or the keyboard opens. A change
 * on the page itself (picking a post type re-renders the text box, and some keyboards come back for
 * the already focused field) moves nothing: with a tall keyboard the field then stays hidden under
 * it. The returned function, once the keyboard has settled, scrolls the focused field (if any) back
 * above it. It never focuses anything or opens the keyboard.
 */
export function useKeepFocusedFieldVisible(scroll: RefObject<KeyboardAwareScrollViewRef | null>) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => scroll.current?.assureFocusedInputVisible(), KEYBOARD_SETTLE_MS);
  }, [scroll]);
}
