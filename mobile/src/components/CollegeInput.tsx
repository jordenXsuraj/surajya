import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { suggestColleges } from '@/lib/colleges';
import { colors, fonts, radius, touch } from '@/theme/tokens';

type CollegeInputProps = {
  ref?: Ref<TextInput>;
  value: string;
  onChange: (value: string) => void;
  onSubmitEditing?: () => void;
  invalid?: boolean;
};

// Port of the web CollegeInput: suggestions from 2 characters, any typed name is allowed.
// The list sits in the layout (not floating) so it scrolls with the form and the keyboard.
export function CollegeInput({
  ref,
  value,
  onChange,
  onSubmitEditing,
  invalid,
}: CollegeInputProps) {
  const [open, setOpen] = useState(false);
  const suggestions = open ? suggestColleges(value) : [];
  const query = value.trim();

  return (
    <View>
      <Input
        ref={ref}
        placeholder="College name (e.g. Sinhgad, PICT, COEP…)"
        value={value}
        onChangeText={(text) => {
          onChange(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="words"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={onSubmitEditing}
        invalid={invalid}
      />
      {suggestions.length > 0 && (
        <View style={styles.list} accessibilityRole="list">
          {suggestions.map((college, i) => (
            <Pressable
              key={college}
              onPress={() => {
                onChange(college);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={college}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.rowText}>
                🏫 <Highlighted text={college} query={query} />
              </Text>
            </Pressable>
          ))}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Not listed? Just type your full college name</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text style={styles.match}>{text.slice(at, at + query.length)}</Text>
      {text.slice(at + query.length)}
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: -6,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: radius.md,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  row: {
    minHeight: touch.min,
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.br },
  pressed: { backgroundColor: colors.bg3 },
  rowText: { fontFamily: fonts.regular, fontSize: 13.6, lineHeight: 19, color: colors.text },
  match: { fontFamily: fonts.bold, color: colors.accent },
  footer: { paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.bg },
  footerText: { fontFamily: fonts.regular, fontSize: 12, color: colors.dim },
});
