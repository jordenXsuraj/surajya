import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { cloudinaryUrl } from '@/lib/cloudinary';
import { initials } from '@/lib/text';
import { colors, fonts } from '@/theme/tokens';

// Web Connect.jsx list palette (picked by row index there, so it is here too).
const PALETTE = [
  { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  { bg: 'rgba(255,59,92,0.12)', color: '#ff3b5c' },
  { bg: 'rgba(34,197,94,0.14)', color: '#22c55e' },
  { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b' },
  { bg: 'rgba(249,115,22,0.13)', color: '#f97316' },
] as const;

// Web post/reply avatar (fixed blue).
const DEFAULT_COLORS = PALETTE[0];

type AvatarProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
  /** List position → web palette colour. Omit for the fixed post/reply colour. */
  colorIndex?: number;
  anonymous?: boolean;
};

export function Avatar({ name, uri, size = 40, colorIndex, anonymous = false }: AvatarProps) {
  const palette = colorIndex === undefined ? DEFAULT_COLORS : PALETTE[colorIndex % PALETTE.length]!;
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (anonymous) {
    return (
      <View
        style={[styles.center, box, { backgroundColor: colors.bg3 }]}
        accessibilityLabel="Anonymous"
      >
        <Text style={{ fontSize: size * 0.45 }}>👤</Text>
      </View>
    );
  }

  if (uri) {
    return (
      <Image
        source={{ uri: cloudinaryUrl(uri, { width: size * 3 }) }}
        style={[box, { backgroundColor: colors.bg3 }]}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        accessibilityLabel={name ?? 'Profile photo'}
      />
    );
  }

  return (
    <View
      style={[styles.center, box, { backgroundColor: palette.bg }]}
      accessibilityLabel={name ?? undefined}
    >
      <Text style={{ color: palette.color, fontFamily: fonts.bold, fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
