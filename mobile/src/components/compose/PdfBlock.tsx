import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/compose/ProgressBar';
import { Text } from '@/components/ui/Text';
import type { PdfState } from '@/hooks/useComposeUploads';
import { decodeEntities } from '@/lib/text';
import { colors, fonts, radius, touch } from '@/theme/tokens';

type PdfBlockProps = { state: PdfState; onRetry: () => void; onRemove: () => void };

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

// Web PDF states: uploading (name, bar, %, "do not close"), ready ("123 KB · Ready to post" ✓ ✕).
export function PdfBlock({ state, onRetry, onRemove }: PdfBlockProps) {
  if (state.status === 'idle') return null;
  const name = decodeEntities(state.name) || 'Document.pdf';

  return (
    <View
      style={[
        styles.box,
        state.status === 'done' && styles.done,
        state.status === 'error' && styles.failed,
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.icon}>📄</Text>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {state.status === 'uploading' ? (
            <View style={styles.barWrap}>
              <ProgressBar progress={state.progress} />
            </View>
          ) : (
            <Text style={styles.meta}>
              {state.status === 'done' ? `${kb(state.size)} · Ready to post` : state.message}
            </Text>
          )}
        </View>
        {state.status === 'uploading' ? (
          <Text style={styles.pct}>{Math.round(state.progress * 100)}%</Text>
        ) : state.status === 'done' ? (
          <Text style={styles.tick}>✓</Text>
        ) : (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            hitSlop={touch.hitSlop}
            style={styles.retry}
          >
            <Text style={styles.retryText}>↻ Retry</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={state.status === 'uploading' ? 'Cancel PDF upload' : 'Remove PDF'}
          hitSlop={touch.hitSlop}
          style={styles.remove}
        >
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>
      {state.status === 'uploading' ? (
        <Text style={styles.hint}>Uploading PDF… do not close this page</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br2,
    backgroundColor: colors.bg2,
  },
  done: { borderColor: colors.green },
  failed: { borderColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 24 },
  info: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: fonts.bold, fontSize: 13.1, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 10.9, color: colors.dim },
  barWrap: { marginTop: 2 },
  pct: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.accent },
  tick: { fontFamily: fonts.bold, fontSize: 12, color: colors.green },
  retry: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  retryText: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.white },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.muted, fontSize: 14 },
  hint: { fontFamily: fonts.regular, fontSize: 10.9, color: colors.dim, textAlign: 'center' },
});
