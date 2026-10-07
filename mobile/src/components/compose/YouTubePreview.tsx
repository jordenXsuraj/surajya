import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { youtubePreview } from '@/lib/compose';
import { colors, fonts, touch } from '@/theme/tokens';

// Web: thumbnail, "🎥 YouTube Video Attached / Ready to post", ✕.
export function YouTubePreview({ videoId, onRemove }: { videoId: string; onRemove: () => void }) {
  return (
    <View style={styles.box}>
      <Image
        source={{ uri: youtubePreview(videoId) }}
        style={styles.thumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.meta}>
        <Text style={styles.title}>🎥 YouTube Video Attached</Text>
        <Text style={styles.sub}>Ready to post</Text>
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove YouTube video"
        hitSlop={touch.hitSlop}
        style={styles.remove}
      >
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.br2,
    backgroundColor: colors.bg2,
  },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.bg3 },
  meta: { padding: 12 },
  title: { fontFamily: fonts.bold, fontSize: 13.6, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.dim, marginTop: 2 },
  remove: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  removeText: { color: colors.white, fontSize: 14 },
});
