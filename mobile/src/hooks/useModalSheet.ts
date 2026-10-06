import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/**
 * Drives a BottomSheetModal from store state (`open`).
 *
 * Only calls dismiss() on a sheet this hook presented: dismiss() on a modal that was never shown
 * (or already closed itself) leaves @gorhom/bottom-sheet in its DISMISSING status for good, and
 * every later present() is then silently ignored — the sheet never opens again.
 * Android back closes an open sheet instead of navigating away underneath it.
 */
export function useModalSheet(open: boolean, close: () => void) {
  const ref = useRef<BottomSheetModal>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (open && !shown.current) {
      shown.current = true;
      ref.current?.present();
    } else if (!open && shown.current) {
      shown.current = false;
      ref.current?.dismiss();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open, close]);

  // The sheet closed itself (swipe down, backdrop tap): it is already dismissed
  const onDismiss = useCallback(() => {
    shown.current = false;
    close();
  }, [close]);

  return { ref, onDismiss };
}
