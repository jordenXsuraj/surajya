import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

type EmptyStateProps = {
  emoji?: string;
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
};

export function EmptyState({ emoji, title, message, actionTitle, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text variant="title" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="caption" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 6,
  },
  emoji: { fontSize: 40, marginBottom: 6 },
  message: { maxWidth: 300 },
  action: { marginTop: 14, maxWidth: 220 },
});
