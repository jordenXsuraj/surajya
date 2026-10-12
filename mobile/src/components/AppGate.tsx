import { useEffect, useState } from 'react';
import { BackHandler, Keyboard, Linking, Platform, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Button, Screen, Text } from '@/components/ui';
import { installedVersion } from '@/lib/version';
import { refreshAppConfig, useAppConfig } from '@/stores/appConfig.store';
import { colors, fonts } from '@/theme/tokens';

const DEFAULT_MAINTENANCE =
  "MeetNet is down for a short update. We'll be back soon — try again in a few minutes.";

/** What the root layout shows instead of the app, if anything (forced update, maintenance). */
export function useAppGate(): 'update' | 'maintenance' | null {
  const updateRequired = useAppConfig((s) => s.updateRequired);
  const maintenance = useAppConfig((s) => s.maintenance.enabled);
  if (updateRequired) return 'update';
  if (maintenance) return 'maintenance';
  return null;
}

// Android back would leave the app on a blank stack: keep these screens until they're resolved.
// A keyboard left open by the screen underneath would cover their buttons: closed on arrival.
function useBlockBack() {
  useEffect(() => {
    Keyboard.dismiss();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
}

export function UpdateRequiredScreen() {
  const storeUrl = useAppConfig((s) => s.storeUrl);
  const store = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
  useBlockBack();

  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.logo}>
          <Logo size="sm" />
        </View>
        <Text style={styles.emoji}>⬆️</Text>
        <Text variant="title" align="center" accessibilityRole="header">
          Update required
        </Text>
        <Text variant="caption" align="center">
          This version of MeetNet ({installedVersion() ?? 'unknown'}) is no longer supported.{' '}
          {storeUrl ? 'Update to keep using the app.' : `Update MeetNet from ${store} to keep using it.`}
        </Text>
        {storeUrl ? (
          <Button
            title="Update"
            onPress={() => void Linking.openURL(storeUrl).catch(() => undefined)}
          />
        ) : null}
        <Button title="Check again" variant="secondary" onPress={() => void refreshAppConfig()} />
      </View>
    </Screen>
  );
}

export function MaintenanceScreen() {
  const message = useAppConfig((s) => s.maintenance.message);
  const [checking, setChecking] = useState(false);
  useBlockBack();

  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.logo}>
          <Logo size="sm" />
        </View>
        <Text style={styles.emoji}>🛠️</Text>
        <Text variant="title" align="center" accessibilityRole="header">
          Back soon
        </Text>
        <Text variant="caption" align="center" style={styles.message}>
          {message || DEFAULT_MAINTENANCE}
        </Text>
        <Button
          title="Try again"
          loading={checking}
          loadingTitle="Checking…"
          onPress={async () => {
            setChecking(true);
            await refreshAppConfig();
            setChecking(false);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: 14 },
  logo: { alignItems: 'center' },
  emoji: { fontSize: 44, lineHeight: 56, textAlign: 'center', marginTop: 12 },
  message: { color: colors.muted, fontFamily: fonts.regular },
});
