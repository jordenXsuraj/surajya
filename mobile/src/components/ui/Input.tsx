import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, fontSize, radius, touch } from '@/theme/tokens';

export type InputProps = Omit<TextInputProps, 'placeholderTextColor'> & {
  ref?: Ref<TextInput>;
  /** Highlights the border like a focused field when the last error points at this field. */
  invalid?: boolean;
  /** Password field with the web's 👁️ / 🙈 toggle. */
  password?: boolean;
  multiline?: boolean;
};

// .ob-inp / .ob-textarea. The web uses placeholders instead of labels; the placeholder doubles
// as the accessibility label unless one is passed.
export function Input({
  ref,
  invalid = false,
  password = false,
  multiline = false,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.dim}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        secureTextEntry={password && !visible}
        autoCapitalize={password ? 'none' : rest.autoCapitalize}
        autoCorrect={password ? false : rest.autoCorrect}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={accessibilityLabel ?? rest.placeholder}
        maxFontSizeMultiplier={1.4}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.textarea,
          password && styles.withToggle,
          (focused || invalid) && styles.focused,
          style,
        ]}
      />
      {password && (
        <Pressable
          onPress={() => setVisible((v) => !v)}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.toggleIcon}>{visible ? '🙈' : '👁️'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginBottom: 10 },
  input: {
    height: 48,
    backgroundColor: colors.bg3,
    borderWidth: 1.5,
    borderColor: colors.br,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
  textarea: {
    height: undefined,
    minHeight: 100,
    paddingTop: 12,
    paddingBottom: 12,
    lineHeight: 23,
  },
  withToggle: { paddingRight: 52 },
  focused: { borderColor: colors.accent },
  toggle: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIcon: { fontSize: 17.6 },
});
