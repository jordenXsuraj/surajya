import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, fontSize, radius } from '@/theme/tokens';

type MessageProps = {
  text: string | undefined | null;
  /** error = .ob-err, success = .doc-ok */
  type?: 'error' | 'success';
};

// Inline form message. Announced to screen readers when it appears.
export function Message({ text, type = 'error' }: MessageProps) {
  if (!text) return null;
  const success = type === 'success';
  return (
    <View
      style={[styles.box, { backgroundColor: success ? colors.gl : colors.al }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={[styles.text, { color: success ? colors.green : colors.accent }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.sm, marginBottom: 10 },
  text: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 18 },
});
