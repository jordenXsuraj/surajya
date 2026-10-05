import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Logo } from '@/components/Logo';
import { Button, Chip, Screen, Text } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme/tokens';

// Web Onboard.jsx hero (.ob-hero). The last chip is "🚀 Project" (web: "project", to be fixed there).
const HERO_CHIPS = [
  '💼 Placement',
  '🤫 Confession',
  '🤝 Partner',
  '📚 Exam',
  '🔥 Social',
  '📰 News',
  '🚀 Project',
];

export default function WelcomeScreen() {
  return (
    <Screen padded={false}>
      {/* radial-gradient(ellipse 80% 50% at 50% 35%, rgba(255,59,92,.1), transparent) */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="35%" rx="80%" ry="50%">
            <Stop offset="0" stopColor="rgb(255,59,92)" stopOpacity={0.1} />
            <Stop offset="1" stopColor="rgb(255,59,92)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>

      <View style={styles.hero}>
        <Logo />
        <Text style={styles.tagline} align="center">
          Your campus.{'\n'}
          <Text style={styles.taglineStrong}>Connect. Post. Grow.</Text>
        </Text>
        <View style={styles.chips}>
          {HERO_CHIPS.map((chip) => (
            <Chip key={chip} label={chip} variant="pill" />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button title="Create account" onPress={() => router.push('/signup/step-1')} />
        <Button title="Log In" variant="secondary" onPress={() => router.push('/login')} />
        <Text variant="note" align="center" style={styles.note}>
          Only your college. Private & safe 🔒
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 15.5,
    lineHeight: 25.6,
    color: colors.muted,
    marginTop: 12,
    marginBottom: 26,
  },
  taglineStrong: { fontFamily: fonts.bold, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  actions: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.br,
  },
  note: { marginTop: 4 },
});
