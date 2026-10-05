import { useNavigation } from 'expo-router';
import { useEffect } from 'react';

/**
 * Runs `onReselect` when the user taps this screen's tab while it is already focused
 * (refetch the list). Scrolling to the top is handled by useScrollToTop on the list itself.
 */
export function useTabReselect(onReselect: () => void) {
  const navigation = useNavigation();

  useEffect(() => {
    // tabPress exists on tab screens only; on other navigators the listener never fires.
    const unsubscribe = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) onReselect();
    });
    return unsubscribe;
  }, [navigation, onReselect]);
}
