import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup/step-1" />
      <Stack.Screen name="signup/step-2" />
    </Stack>
  );
}
