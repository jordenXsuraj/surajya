import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { mediaSections, type MediaView } from '@/lib/media';
import { youTubeThumbnail } from '@/lib/youtube';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, radius, touch } from '@/theme/tokens';
import type { MediaItem } from '@/types/user';

type MediaGridProps = {
  items: MediaItem[] | undefined;
  /** My own profile: other empty text, and the add button. */
  isOwn?: boolean;
  onAdd?: () => void;
  /** Edit form: ✕ on each card. */
  onRemove?: (url: string) => void;
};

// Web Profile.jsx MediaTab / MediaItem: a "YouTube" section of video cards (16:9, Shorts 9:16,
// "▶ YT" and "Short" badges; tap plays in the app's YouTube player) and an "Instagram" section of
// profile cards ("@user · Instagram · Visit ↗"). Unlike the web, every item is shown (the web
// silently stops after 6 per section).
export function MediaGrid({ items, isOwn = false, onAdd, onRemove }: MediaGridProps) {
  const { videos, instagram } = mediaSections(items);

  if (videos.length === 0 && instagram.length === 0) {
    return isOwn ? (
      <View style={styles.ownEmpty}>
        <Text variant="caption" align="center">
          Add YouTube videos, Shorts, Instagram profile etc
        </Text>
        {onAdd ? <AddButton onPress={onAdd} /> : null}
      </View>
    ) : (
      <EmptyState
        emoji="🎬"
        title="No media yet"
        message="This student hasn't added any videos yet"
      />
    );
  }

  return (
    <View style={styles.root}>
      {videos.length > 0 && (
        <>
          <Text style={styles.label}>YouTube</Text>
          <View style={styles.grid}>
            {videos.map((v) => (
              <VideoCard key={v.url} view={v} onRemove={onRemove} />
            ))}
          </View>
        </>
      )}
      {instagram.length > 0 && (
        <>
          <Text style={[styles.label, videos.length > 0 && styles.labelGap]}>Instagram</Text>
          {instagram.map((v) => (
            <InstagramCard key={v.url} view={v} onRemove={onRemove} />
          ))}
        </>
      )}
      {isOwn && onAdd ? <AddButton onPress={onAdd} /> : null}
    </View>
  );
}

function VideoCard({
  view,
  onRemove,
}: {
  view: Extract<MediaView, { kind: 'video' }>;
  onRemove?: (url: string) => void;
}) {
  return (
    <Pressable
      onPress={() => usePostUi.getState().openVideo(view.videoId)}
      accessibilityRole="button"
      accessibilityLabel={view.short ? 'Play YouTube Short' : 'Play YouTube video'}
      style={({ pressed }) => [
        styles.card,
        view.short ? styles.short : styles.video,
        pressed && styles.pressed,
      ]}
    >
      <Image
        source={{ uri: youTubeThumbnail(view.videoId) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessible={false}
      />
      <View style={styles.playOverlay}>
        <View style={styles.playButton}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>
      <View style={styles.ytBadge}>
        <Text style={styles.badgeText}>▶ YT</Text>
      </View>
      {view.short && (
        <View style={styles.shortBadge}>
          <Text style={styles.shortText}>Short</Text>
        </View>
      )}
      {onRemove ? <RemoveButton onPress={() => onRemove(view.url)} label="Remove video" /> : null}
    </Pressable>
  );
}

function InstagramCard({
  view,
  onRemove,
}: {
  view: Extract<MediaView, { kind: 'instagram' }>;
  onRemove?: (url: string) => void;
}) {
  return (
    <View style={styles.igCard}>
      <View style={styles.igLeft}>
        <Text style={styles.igIcon}>📸</Text>
        <View style={styles.igText}>
          <Text style={styles.igName} numberOfLines={1}>
            @{view.handle}
          </Text>
          <Text style={styles.igSub}>Instagram</Text>
        </View>
      </View>
      <Pressable
        onPress={() => void Linking.openURL(view.url)}
        accessibilityRole="link"
        accessibilityLabel={`Visit @${view.handle} on Instagram`}
        hitSlop={touch.hitSlop}
        style={styles.igVisit}
      >
        <Text style={styles.igVisitText}>Visit ↗</Text>
      </Pressable>
      {onRemove ? (
        <RemoveButton onPress={() => onRemove(view.url)} label="Remove Instagram" inline />
      ) : null}
    </View>
  );
}

function RemoveButton({
  onPress,
  label,
  inline = false,
}: {
  onPress: () => void;
  label: string;
  inline?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={touch.hitSlop}
      style={[styles.remove, !inline && styles.removeFloating]}
    >
      <Text style={styles.removeText}>✕</Text>
    </Pressable>
  );
}

function AddButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.add, pressed && styles.pressed]}
    >
      <Text style={styles.addText}>+ Add YouTube or Instagram</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 4 },
  ownEmpty: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  label: {
    fontFamily: fonts.bold,
    fontSize: 11.5,
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  labelGap: { marginTop: 18 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: 10,
  },
  card: {
    width: '48.5%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.br,
  },
  video: { aspectRatio: 16 / 9 },
  short: { aspectRatio: 9 / 16 },
  pressed: { opacity: 0.85 },
  playOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.shade,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.playButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 16, color: colors.bg, marginLeft: 2 },
  ytBadge: {
    position: 'absolute',
    bottom: 7,
    left: 7,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.youtube,
  },
  badgeText: { fontFamily: fonts.extrabold, fontSize: 10, color: colors.white },
  shortBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: colors.shadeStrong,
  },
  shortText: { fontFamily: fonts.bold, fontSize: 9.6, color: colors.white },
  igCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.igBorder,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.igTintFrom}, ${colors.igTintTo})`,
  },
  igLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  igIcon: { fontSize: 22 },
  igText: { flex: 1, minWidth: 0 },
  igName: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  igSub: { fontFamily: fonts.regular, fontSize: 10.4, color: colors.dim, marginTop: 2 },
  igVisit: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.igMain,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.igFrom}, ${colors.igMid}, ${colors.igMain}, ${colors.igTo})`,
  },
  igVisitText: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.white },
  remove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.shadeHeavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeFloating: { position: 'absolute', top: 6, right: 6 },
  removeText: { fontSize: 11, color: colors.white },
  add: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 9,
    paddingHorizontal: 16,
    minHeight: touch.min,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ag,
    backgroundColor: colors.al,
  },
  addText: { fontFamily: fonts.bold, fontSize: 12, color: colors.accent },
});
