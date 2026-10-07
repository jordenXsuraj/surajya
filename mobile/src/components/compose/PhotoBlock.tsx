import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/compose/ProgressBar';
import { Text } from '@/components/ui/Text';
import type { PhotoState } from '@/hooks/useComposeUploads';
import { cloudinaryUrl } from '@/lib/cloudinary';
import { colors, fonts, touch } from '@/theme/tokens';

type PhotoBlockProps = {
  state: PhotoState;
  onRetry: () => void;
  onRemove: () => void;
};

// Web .img-preview-zone: preview, "Compressing…" / "Uploading n%", "✓ Uploaded", ✕.
export function PhotoBlock({ state, onRetry, onRemove }: PhotoBlockProps) {
  if (state.status === 'idle') return null;
  const busy = state.status === 'compressing' || state.status === 'uploading';
  const uri =
    state.status === 'done' && state.url === state.localUri
      ? cloudinaryUrl(state.url)
      : state.localUri;

  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri }}
        style={[styles.image, busy && styles.dim]}
        contentFit="cover"
        transition={150}
      />
      {busy ? (
        <>
          <View style={styles.status}>
            <Text style={styles.statusText}>
              {state.status === 'compressing'
                ? 'Compressing…'
                : `Uploading ${Math.round(state.progress * 100)}%`}
            </Text>
          </View>
          <View style={styles.bar}>
            <ProgressBar progress={state.status === 'uploading' ? state.progress : 0} />
          </View>
        </>
      ) : null}
      {state.status === 'done' ? (
        <View style={[styles.badge, styles.ok]}>
          <Text style={styles.badgeText}>✓ Uploaded</Text>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} numberOfLines={2}>
            {state.message}
          </Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            hitSlop={touch.hitSlop}
            style={styles.retry}
          >
            <Text style={styles.retryText}>↻ Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Cancel upload and remove photo' : 'Remove photo'}
        hitSlop={touch.hitSlop}
        style={styles.remove}
      >
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.br2,
    backgroundColor: colors.bg3,
  },
  image: { width: '100%', aspectRatio: 16 / 9 },
  dim: { opacity: 0.55 },
  status: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  statusText: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  badge: {
    position: 'absolute',
    top: 10,
    left: 12,
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  ok: { backgroundColor: colors.green },
  badgeText: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  errorBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  errorText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  retry: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  retryText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  remove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  removeText: { color: colors.white, fontSize: 14 },
});
