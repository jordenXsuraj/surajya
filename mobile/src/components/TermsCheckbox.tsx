import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { openWebPage, webPages } from '@/lib/links';
import { colors, fonts, fontSize, touch } from '@/theme/tokens';

type TermsCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

// .ob-check — same wording as the web signup. The links open the web pages in-app.
export function TermsCheckbox({ checked, onChange }: TermsCheckboxProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I'm 18 or older and I agree to the Terms, Privacy Policy and Community Guidelines"
        hitSlop={touch.hitSlop}
        style={styles.boxHit}
      >
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <Text style={styles.tick}>✓</Text> : null}
        </View>
      </Pressable>
      <Text style={styles.text} onPress={() => onChange(!checked)}>
        I'm 18 or older and I agree to the{' '}
        <Text
          style={styles.link}
          onPress={() => void openWebPage(webPages.terms)}
          accessibilityRole="link"
        >
          Terms
        </Text>
        ,{' '}
        <Text
          style={styles.link}
          onPress={() => void openWebPage(webPages.privacy)}
          accessibilityRole="link"
        >
          Privacy Policy
        </Text>{' '}
        and{' '}
        <Text
          style={styles.link}
          onPress={() => void openWebPage(webPages.communityGuidelines)}
          accessibilityRole="link"
        >
          Community Guidelines
        </Text>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginHorizontal: 2,
    marginTop: 2,
    marginBottom: 12,
  },
  boxHit: { paddingTop: 1 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.br2,
    backgroundColor: colors.bg3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: colors.white, fontFamily: fonts.bold, fontSize: 13, lineHeight: 16 },
  text: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: colors.muted,
  },
  link: { color: colors.text, textDecorationLine: 'underline' },
});
