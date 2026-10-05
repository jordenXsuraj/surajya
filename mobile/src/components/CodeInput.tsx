import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { colors } from '@/theme/tokens';

export const CODE_LENGTH = 6;
export const EMPTY_CODE: readonly string[] = Array.from({ length: CODE_LENGTH }, () => '');

type CodeInputProps = {
  digits: readonly string[];
  onChange: (digits: string[]) => void;
  /** Called once all six boxes are filled. */
  onComplete: (code: string) => void;
  disabled?: boolean;
  /** Re-focuses the first box when it changes (after an error). */
  focusKey?: number;
};

/** Spreads typed or pasted digits from box `from` onwards (web VerifyEmail.jsx fill()). */
export function fillDigits(
  digits: readonly string[],
  from: number,
  text: string,
): { next: string[]; focus: number } | null {
  const incoming = text
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH - from)
    .split('');
  if (!incoming.length) return null;
  const next = [...digits];
  incoming.forEach((d, k) => {
    next[from + k] = d;
  });
  return { next, focus: Math.min(from + incoming.length, CODE_LENGTH - 1) };
}

// .code-boxes: six boxes, numeric keypad, auto-advance, backspace to the previous box,
// typing over a filled box replaces it, pasting a whole code fills every box.
export function CodeInput({
  digits,
  onChange,
  onComplete,
  disabled = false,
  focusKey = 0,
}: CodeInputProps) {
  const boxes = useRef<(TextInput | null)[]>([]);
  const [focused, setFocused] = useState(0);
  const { width } = useWindowDimensions();
  const small = width <= 360;

  useEffect(() => {
    if (focusKey > 0) boxes.current[0]?.focus();
  }, [focusKey]);

  function handleText(i: number, value: string) {
    // With selectTextOnFocus a typed digit replaces the selection; a longer value is a paste
    // or autofill. Two characters in a filled box = typed after the old digit: keep the new one.
    const text = digits[i] && value.length === 2 ? value.slice(-1) : value;
    if (!text) {
      const next = [...digits];
      next[i] = '';
      onChange(next);
      return;
    }
    const result = fillDigits(digits, i, text);
    if (!result) return;
    onChange(result.next);
    boxes.current[result.focus]?.focus();
    if (result.next.every(Boolean)) onComplete(result.next.join(''));
  }

  function handleKey(i: number, key: string) {
    if (key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits];
      next[i - 1] = '';
      onChange(next);
      boxes.current[i - 1]?.focus();
    }
  }

  return (
    <View style={[styles.row, { gap: small ? 5 : 8 }]}>
      {digits.map((digit, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={digit}
          onChangeText={(v) => handleText(i, v)}
          onKeyPress={(e) => handleKey(i, e.nativeEvent.key)}
          onFocus={() => setFocused(i)}
          editable={!disabled}
          autoFocus={i === 0}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType={i === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          importantForAutofill={i === 0 ? 'yes' : 'no'}
          selectTextOnFocus
          maxLength={CODE_LENGTH}
          caretHidden={Boolean(digit)}
          cursorColor={colors.accent}
          selectionColor={colors.al}
          accessibilityLabel={`Digit ${i + 1}`}
          maxFontSizeMultiplier={1.2}
          style={[styles.box, small && styles.boxSmall, focused === i && styles.boxFocused]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 4, marginBottom: 14 },
  box: {
    width: 46,
    height: 56,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Courier New', default: 'monospace' }),
    fontWeight: '800',
    fontSize: 24,
    color: colors.text,
    backgroundColor: colors.bg3,
    borderWidth: 1.5,
    borderColor: colors.br2,
    borderRadius: 12,
    padding: 0,
  },
  boxSmall: { width: 40, height: 50, fontSize: 20.8 },
  boxFocused: { borderColor: colors.accent, boxShadow: `0 0 0 3px ${colors.al}` },
});
