import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { cloudinaryUrl } from '@/lib/cloudinary';
import { usePostUi } from '@/stores/postUi.store';
import { colors, touch } from '@/theme/tokens';

const MAX_SCALE = 4;

/** Full-screen image (web .img-fs-overlay) with pinch-zoom, pan and double-tap zoom. */
export function ImageViewer() {
  const url = usePostUi((s) => s.imageUrl);
  const close = usePostUi((s) => s.closeImage);

  return (
    <Modal
      visible={Boolean(url)}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* Android modals live outside the app's root view: they need their own gesture root */}
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" />
        {url ? <ZoomableImage key={url} url={url} onClose={close} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomableImage({ url, onClose }: { url: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const gesture = useMemo(() => {
    const clamp = (v: number, max: number) => {
      'worklet';
      return Math.min(Math.max(v, -max), max);
    };
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        scale.set(Math.min(Math.max(savedScale.get() * e.scale, 1), MAX_SCALE));
      })
      .onEnd(() => {
        savedScale.set(scale.get());
        if (scale.get() <= 1) {
          tx.set(withTiming(0));
          ty.set(withTiming(0));
          savedTx.set(0);
          savedTy.set(0);
        }
      });
    const pan = Gesture.Pan()
      .averageTouches(true)
      .onUpdate((e) => {
        if (scale.get() <= 1) return;
        const maxX = (width * (scale.get() - 1)) / 2;
        const maxY = (height * (scale.get() - 1)) / 2;
        tx.set(clamp(savedTx.get() + e.translationX, maxX));
        ty.set(clamp(savedTy.get() + e.translationY, maxY));
      })
      .onEnd(() => {
        savedTx.set(tx.get());
        savedTy.set(ty.get());
      });
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        const next = scale.get() > 1 ? 1 : 2.5;
        scale.set(withTiming(next));
        savedScale.set(next);
        tx.set(withTiming(0));
        ty.set(withTiming(0));
        savedTx.set(0);
        savedTy.set(0);
      });
    return Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
  }, [height, width, scale, savedScale, tx, ty, savedTx, savedTy]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, animated]}>
          <Image
            source={{ uri: cloudinaryUrl(url, { width: Math.min(2048, Math.round(width * 3)) }) }}
            placeholder={{ uri: cloudinaryUrl(url, { width: 720 }) }}
            style={styles.fill}
            contentFit="contain"
            accessibilityLabel="Post image, full screen. Pinch to zoom."
          />
        </Animated.View>
      </GestureDetector>
      <Pressable
        onPress={onClose}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[styles.close, { top: insets.top + 8 }]}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.overlay },
  fill: { flex: 1 },
  close: {
    position: 'absolute',
    right: 14,
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeText: { color: colors.white, fontSize: 18 },
});
