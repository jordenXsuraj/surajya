import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { cropPhoto, useProfilePhoto } from '@/hooks/useProfilePhoto';
import { clampOffset, clampZoom, coverScale, type Size } from '@/lib/crop';
import { useProfilePhotoStore } from '@/stores/profilePhoto.store';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, layout } from '@/theme/tokens';

const FRAME_MARGIN = 16;

// Crop the picked profile photo (1:1) or cover (3:1): pinch to zoom, drag to move; the photo
// always covers the frame. "Use photo" crops it on the device, resizes it (600×600 / 1500×500)
// and starts the upload; the Me tab shows the progress.
export default function CropScreen() {
  const source = useProfilePhotoStore((s) => s.crop);
  const photo = useProfilePhoto();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState<Size | null>(null);
  const [busy, setBusy] = useState(false);

  const zoom = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const frame = useMemo<Size | null>(() => {
    if (!area || !source) return null;
    const ratio = source.kind === 'avatar' ? 1 : 3;
    let width = area.width - FRAME_MARGIN * 2;
    let height = width / ratio;
    if (height > area.height - FRAME_MARGIN * 2) {
      height = area.height - FRAME_MARGIN * 2;
      width = height * ratio;
    }
    return { width, height };
  }, [area, source]);

  const image = useMemo<Size | null>(
    () => (source ? { width: source.width, height: source.height } : null),
    [source],
  );

  const gesture = useMemo(() => {
    if (!frame || !image) return Gesture.Pan().enabled(false);
    const pan = Gesture.Pan()
      .onStart(() => {
        startX.set(offsetX.get());
        startY.set(offsetY.get());
      })
      .onUpdate((e) => {
        const next = clampOffset(
          { x: startX.get() + e.translationX, y: startY.get() + e.translationY },
          image,
          frame,
          zoom.get(),
        );
        offsetX.set(next.x);
        offsetY.set(next.y);
      });
    const pinch = Gesture.Pinch()
      .onStart(() => {
        startZoom.set(zoom.get());
      })
      .onUpdate((e) => {
        const z = clampZoom(startZoom.get() * e.scale);
        zoom.set(z);
        const next = clampOffset({ x: offsetX.get(), y: offsetY.get() }, image, frame, z);
        offsetX.set(next.x);
        offsetY.set(next.y);
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [frame, image, offsetX, offsetY, startX, startY, startZoom, zoom]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.get() },
      { translateY: offsetY.get() },
      { scale: zoom.get() },
    ],
  }));

  if (!source) {
    // Opened without a picked photo (e.g. after the app was restarted): nothing to crop
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text align="center">No photo picked.</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const base = frame && image ? coverScale(image, frame) : 1;
  const imageBox = image ? { width: image.width * base, height: image.height * base } : null;

  async function applyCrop() {
    if (!source || !frame || busy) return;
    setBusy(true);
    try {
      const file = await cropPhoto(source.kind, source, frame, zoom.get(), {
        x: offsetX.get(),
        y: offsetY.get(),
      });
      photo.upload(source.kind, file);
    } catch {
      useUiStore.getState().showToast('❌ Could not crop the photo', 'error');
    }
    useProfilePhotoStore.getState().setCrop(null);
    router.back();
  }

  function cancel() {
    useProfilePhotoStore.getState().setCrop(null);
    router.back();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {source.kind === 'avatar' ? 'Crop profile photo' : 'Crop cover photo'}
        </Text>
        <Text variant="caption" align="center">
          Pinch to zoom, drag to move
        </Text>
      </View>

      <GestureDetector gesture={gesture}>
        <View
          style={styles.area}
          onLayout={(e: LayoutChangeEvent) => setArea(e.nativeEvent.layout)}
          accessibilityLabel="Photo to crop"
        >
          {area && frame && imageBox ? (
            <>
              <Animated.View
                style={[
                  styles.imageBox,
                  {
                    width: imageBox.width,
                    height: imageBox.height,
                    left: (area.width - imageBox.width) / 2,
                    top: (area.height - imageBox.height) / 2,
                  },
                  imageStyle,
                ]}
              >
                <Image source={{ uri: source.uri }} style={styles.image} contentFit="fill" />
              </Animated.View>
              <FrameMask area={area} frame={frame} round={source.kind === 'avatar'} />
            </>
          ) : null}
        </View>
      </GestureDetector>

      <View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={cancel} style={styles.action} />
        <Button
          title="Use photo"
          loadingTitle="Preparing…"
          loading={busy}
          onPress={() => void applyCrop()}
          style={styles.action}
        />
      </View>
    </View>
  );
}

/** Darkens everything outside the frame and outlines it (a circle guide for the profile photo). */
function FrameMask({ area, frame, round }: { area: Size; frame: Size; round: boolean }) {
  const left = (area.width - frame.width) / 2;
  const top = (area.height - frame.height) / 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.shade, { left: 0, right: 0, top: 0, height: top }]} />
      <View style={[styles.shade, { left: 0, right: 0, top: top + frame.height, bottom: 0 }]} />
      <View style={[styles.shade, { left: 0, width: left, top, height: frame.height }]} />
      <View style={[styles.shade, { right: 0, width: left, top, height: frame.height }]} />
      <View style={[styles.frame, { left, top, width: frame.width, height: frame.height }]} />
      {round ? (
        <View
          style={[
            styles.circle,
            { left, top, width: frame.width, height: frame.height, borderRadius: frame.width / 2 },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, gap: 12 },
  header: { paddingHorizontal: layout.gutter, paddingTop: 12, gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.text, textAlign: 'center' },
  area: { flex: 1, overflow: 'hidden' },
  imageBox: { position: 'absolute' },
  image: { width: '100%', height: '100%' },
  shade: { position: 'absolute', backgroundColor: colors.shadeStrong },
  frame: { position: 'absolute', borderWidth: 2, borderColor: colors.white },
  circle: { position: 'absolute', borderWidth: 1, borderColor: colors.hint },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: layout.gutter },
  action: { flex: 1 },
});
