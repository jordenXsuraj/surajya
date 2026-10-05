import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { HeartBurst } from '@/components/post/HeartBurst';
import { Text } from '@/components/ui/Text';
import { cloudinaryUrl } from '@/lib/cloudinary';
import { pdfSizeLabel } from '@/lib/postView';
import { decodeEntities } from '@/lib/text';
import { getYouTubeId, youTubeThumbnail } from '@/lib/youtube';
import { colors, fonts, layout, radius, touch } from '@/theme/tokens';

// Card content width: screen minus the card's side padding (16 each side, web .post-card).
const useMediaHeight = () => {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, layout.maxContentWidth) - 32;
  return Math.min(400, Math.round(inner * 0.75)); // web: max-height 400px
};

// ── Image: blurred backdrop + whole image (web .pc-image-wrap). Tap = viewer, double-tap = like.
type PostImageProps = { url: string; burst: number; onOpen: () => void; onDoubleTap: () => void };

export const PostImage = memo(function PostImage({
  url,
  burst,
  onOpen,
  onDoubleTap,
}: PostImageProps) {
  const height = useMediaHeight();
  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        // Act only on taps that completed (onEnd also reports gestures that were cancelled)
        Gesture.Tap()
          .numberOfTaps(2)
          .maxDelay(260)
          .runOnJS(true)
          .onEnd((_e, success) => success && onDoubleTap()),
        Gesture.Tap()
          .runOnJS(true)
          .onEnd((_e, success) => success && onOpen()),
      ),
    [onDoubleTap, onOpen],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.media, { height }]}
        collapsable={false}
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel="Post image. Double-tap to like, tap to expand."
      >
        <Image
          source={{ uri: cloudinaryUrl(url, { width: 60 }) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={25}
          cachePolicy="memory-disk"
        />
        <View style={styles.dim} />
        <Image
          source={{ uri: cloudinaryUrl(url, { width: 720 }) }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={url}
        />
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>🔍 Tap to expand</Text>
        </View>
        <HeartBurst trigger={burst} />
      </View>
    </GestureDetector>
  );
});

// ── YouTube thumbnail → in-app player
type PostVideoProps = { youtubeUrl: string; onOpen: (id: string) => void };

export const PostVideo = memo(function PostVideo({ youtubeUrl, onOpen }: PostVideoProps) {
  const { width } = useWindowDimensions();
  const id = getYouTubeId(youtubeUrl);
  if (!id) return null;
  const height = Math.round(((Math.min(width, layout.maxContentWidth) - 32) * 9) / 16);
  return (
    <Pressable
      onPress={() => onOpen(id)}
      accessibilityRole="button"
      accessibilityLabel="Play YouTube video"
      style={[styles.media, { height }]}
    >
      <Image
        source={{ uri: youTubeThumbnail(id) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={id}
      />
      <View style={styles.play} pointerEvents="none">
        <Text style={styles.playIcon}>▶</Text>
      </View>
      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>▶ Tap to watch</Text>
      </View>
    </Pressable>
  );
});

// ── PDF row (web: name, "PDF · 123 KB", "👁 View" in Google's viewer)
type PostPdfProps = { name: string; size: number; onOpen: () => void };

export const PostPdf = memo(function PostPdf({ name, size, onOpen }: PostPdfProps) {
  const title = decodeEntities(name) || 'Document.pdf';
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open PDF ${title}`}
      style={({ pressed }) => [styles.pdf, pressed && styles.pressed]}
    >
      <View style={styles.pdfIcon}>
        <Text style={styles.pdfEmoji}>📄</Text>
      </View>
      <View style={styles.pdfInfo}>
        <Text style={styles.pdfName} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.pdfMeta}>{pdfSizeLabel(size)}</Text>
        <Text style={styles.pdfNote}>Download available on laptop 💻</Text>
      </View>
      <View style={styles.pdfView}>
        <Text style={styles.pdfViewText}>👁 View</Text>
      </View>
    </Pressable>
  );
});

// ── Tags and link
export const PostTags = memo(function PostTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <View style={styles.tags}>
      {tags.map((tag) => (
        <View key={tag} style={styles.tag}>
          <Text style={styles.tagText}>#{decodeEntities(tag)}</Text>
        </View>
      ))}
    </View>
  );
});

export const PostLink = memo(function PostLink({
  link,
  onOpen,
}: {
  link: string;
  onOpen: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      hitSlop={touch.hitSlop}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Text style={styles.linkText} numberOfLines={1}>
        🔗 {decodeEntities(link)}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  media: {
    width: '100%',
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
    justifyContent: 'center',
  },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  hint: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: colors.scrim,
  },
  hintText: { fontFamily: fonts.bold, fontSize: 9.6, color: colors.hint },
  play: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: colors.white, fontSize: 22, marginLeft: 3 },
  pdf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg2,
    borderWidth: 1.5,
    borderColor: 'rgba(199,107,15,0.4)',
    borderRadius: 14,
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
  },
  pdfIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.3)',
  },
  pdfEmoji: { fontSize: 22 },
  pdfInfo: { flex: 1, minWidth: 0 },
  pdfName: { fontFamily: fonts.bold, fontSize: 13.6, color: colors.text },
  pdfMeta: { fontFamily: fonts.regular, fontSize: 10.4, color: colors.dim, marginTop: 2 },
  pdfNote: { fontFamily: fonts.regular, fontSize: 9.6, color: colors.dim, marginTop: 3 },
  pdfView: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bl,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  pdfViewText: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.blue },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  tag: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: 7,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 10.9, color: colors.muted },
  link: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 9,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: radius.sm,
  },
  linkText: { fontFamily: fonts.semibold, fontSize: 11.2, color: colors.blue },
  pressed: { opacity: 0.75 },
});
