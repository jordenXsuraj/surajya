import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { colors, fonts, fontSize, type ColorName, type FontWeightName } from '@/theme/tokens';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label' | 'note';

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: ColorName;
  weight?: FontWeightName;
  align?: 'left' | 'center' | 'right';
};

const variantStyles = StyleSheet.create({
  // .ob-logo / page logos
  display: { fontFamily: fonts.display, fontSize: fontSize.display, letterSpacing: -2.4 },
  // .s2-title
  title: { fontFamily: fonts.display, fontSize: fontSize.xl, letterSpacing: -0.6 },
  // .doc-h1
  heading: { fontFamily: fonts.extrabold, fontSize: fontSize.xxl, letterSpacing: -0.5 },
  // .doc-page p
  body: { fontFamily: fonts.regular, fontSize: fontSize.md, lineHeight: 22 },
  // .s2-sub
  caption: { fontFamily: fonts.regular, fontSize: 12.8, lineHeight: 19 },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  // .ob-note
  note: { fontFamily: fonts.regular, fontSize: fontSize.xs },
});

const defaultColor: Record<Variant, ColorName> = {
  display: 'text',
  title: 'text',
  heading: 'text',
  body: 'muted',
  caption: 'muted',
  label: 'muted',
  note: 'dim',
};

export function Text({ variant = 'body', color, weight, align, style, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[
        variantStyles[variant],
        { color: colors[color ?? defaultColor[variant]] },
        weight && { fontFamily: fonts[weight] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
