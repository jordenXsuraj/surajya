import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, touch } from '@/theme/tokens';

type BackButtonProps = { label?: string; onPress?: () => void };

// Like the web's .doc-back link: "← Back".
export function BackButton({ label = 'Back', onPress }: BackButtonProps) {
  function goBack() {
    if (onPress) return onPress();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={touch.hitSlop}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.text}>← {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: touch.min, justifyContent: 'center', alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
  text: { fontFamily: fonts.medium, fontSize: 12.8, color: colors.muted },
});
