import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer from 'react-native-youtube-iframe';

import { Text } from '@/components/ui/Text';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, touch } from '@/theme/tokens';

/** In-app YouTube player (web: iframe in an overlay, autoplay). */
export function YouTubeModal() {
  const videoId = usePostUi((s) => s.videoId);
  const close = usePostUi((s) => s.closeVideo);

  return (
    <Modal
      visible={Boolean(videoId)}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <StatusBar style="light" />
      {videoId ? <Player key={videoId} videoId={videoId} onClose={close} /> : null}
    </Modal>
  );
}

function Player({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const height = Math.round((width * 9) / 16);

  return (
    <Pressable style={styles.root} onPress={onClose} accessibilityLabel="Close video">
      <Pressable style={[styles.frame, { height }]} onPress={() => undefined}>
        {failed ? (
          <Text style={styles.error}>This video can't be played here.</Text>
        ) : (
          <YoutubePlayer
            height={height}
            width={width}
            videoId={videoId}
            play
            onReady={() => setReady(true)}
            onError={() => setFailed(true)}
            webViewStyle={styles.webview}
          />
        )}
        {!ready && !failed ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={colors.white} />
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onClose}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[styles.close, { top: insets.top + 8 }]}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center' },
  frame: { width: '100%', backgroundColor: '#000000', justifyContent: 'center' },
  webview: { backgroundColor: '#000000' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, textAlign: 'center' },
  close: {
    position: 'absolute',
    right: 14,
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeText: { color: colors.white, fontSize: 18 },
});
