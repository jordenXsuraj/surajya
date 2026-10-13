import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';

import { TabBar } from '@/components/TabBar';
import { useAuthStore } from '@/stores/auth.store';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const pendingVerify = useAuthStore((s) => s.pendingVerify);
  const pendingPath = useAuthStore((s) => s.pendingPath);

  // Right after sign-in, once this stack exists: first the link or notification opened while
  // signed out, then (after signup) the verify screen on top ("Skip for now" goes back).
  useEffect(() => {
    if (!pendingPath && !pendingVerify) return;
    const auth = useAuthStore.getState();
    if (pendingPath) {
      auth.setPendingPath(null);
      router.push(pendingPath as never);
    }
    if (pendingVerify) {
      auth.clearPendingVerify();
      router.push('/verify-email');
    }
  }, [pendingPath, pendingVerify]);

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
