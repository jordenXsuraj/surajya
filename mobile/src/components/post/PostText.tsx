import { useRecyclingState } from '@shopify/flash-list';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View, type TextLayoutEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { HeartBurst } from '@/components/post/HeartBurst';
import { Text } from '@/components/ui/Text';
import { decodeEntities } from '@/lib/text';
import { colors, fonts, touch } from '@/theme/tokens';

const COLLAPSED_LINES = 6; // web Home/PostCard: -webkit-line-clamp: 6

type PostTextProps = {
  postId: string;
  text: string;
  /** Show everything (post screen). */
  expandedByDefault?: boolean;
  burst: number;
  onDoubleTap: () => void;
  /** Single tap (feed: open the post). */
  onPress?: () => void;
};

// .pc-text with the web's "▼ See more" / "▲ See less". Double-tap likes.
export const PostText = memo(function PostText({
  postId,
  text,
  expandedByDefault = false,
  burst,
  onDoubleTap,
  onPress,
}: PostTextProps) {
  const body = decodeEntities(text);
  const [expanded, setExpanded] = useRecyclingState(expandedByDefault, [postId]);
  const [lineCount, setLineCount] = useRecyclingState(0, [postId, text]);
  // Only texts that could exceed 6 lines pay for a measuring pass
  const mayBeLong =
    !expandedByDefault && (body.length > 180 || body.split('\n').length > COLLAPSED_LINES);
  const isLong = lineCount > COLLAPSED_LINES;

  const gesture = useMemo(() => {
    // Act only on taps that completed (onEnd also reports gestures that were cancelled)
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(touch.doubleTapMs)
      .runOnJS(true)
      .onEnd((_e, success) => success && onDoubleTap());
    if (!onPress) return double;
    const single = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_e, success) => success && onPress());
    return Gesture.Exclusive(double, single);
  }, [onDoubleTap, onPress]);

  if (!body) return null;

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View collapsable={false}>
          {mayBeLong ? (
            <Text
              style={[styles.text, styles.measure]}
              onTextLayout={(e: TextLayoutEvent) => setLineCount(e.nativeEvent.lines.length)}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {body}
            </Text>
          ) : null}
          <Text
            style={styles.text}
            numberOfLines={expanded ? undefined : COLLAPSED_LINES}
            selectable={false}
          >
            {body}
          </Text>
          <HeartBurst trigger={burst} />
        </View>
      </GestureDetector>
      {isLong ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          hitSlop={touch.hitSlop}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={styles.moreText}>{expanded ? '▲ See less' : '▼ See more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  text: { fontFamily: fonts.medium, fontSize: 15.2, lineHeight: 25.8, color: colors.muted },
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  more: { alignSelf: 'flex-start', paddingVertical: 2 },
  moreText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.accent },
});
