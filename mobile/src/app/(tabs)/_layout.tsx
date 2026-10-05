import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';

import { TabBar } from '@/components/TabBar';
import { useAuthStore } from '@/stores/auth.store';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const pendingVerify = useAuthStore((s) => s.pendingVerify);

  // Right after signup: open the verify screen on top of Home once this stack exists
  // ("Skip for now" goes back to Home).
  useEffect(() => {
    if (!pendingVerify) return;
    useAuthStore.getState().clearPendingVerify();
    router.push('/verify-email');
  }, [pendingVerify]);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="following" />
      <Tabs.Screen name="connect" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
