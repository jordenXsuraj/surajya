import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

/** Thin upload progress bar (0…1), accent → orange like the web PDF bar. */
export function ProgressBar({ progress }: { progress: number }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` as const;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <View style={[styles.fill, { width: pct }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.br2 },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.accent,
    experimental_backgroundImage: `linear-gradient(90deg, ${colors.accent}, ${colors.orange})`,
  },
});
