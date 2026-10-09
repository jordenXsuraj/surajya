import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Input, Text } from '@/components/ui';
import { BRANCH_SKILLS, MAX_SKILLS, type Branch } from '@/lib/skills';

type SkillPickerProps = {
  branch: string;
  skills: string[];
  onChange: (skills: string[]) => void;
};

/**
 * Web skill picker (Onboard StepProfile, Profile edit): the branch's suggestions as chips (✓ when
 * on), your own skills as dashed chips with ✕, and a box to add one. Suggestions toggle freely;
 * your own skills can be added while fewer than MAX_SKILLS are selected. Duplicates are refused
 * ignoring case ("react" when "React" is there).
 */
export function SkillPicker({ branch, skills, onChange }: SkillPickerProps) {
  const [custom, setCustom] = useState('');
  const suggestions = BRANCH_SKILLS[branch as Branch] ?? BRANCH_SKILLS.CS;
  const own = skills.filter((s) => !suggestions.includes(s));
  const full = skills.length >= MAX_SKILLS;

  const toggle = (skill: string) =>
    onChange(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill]);

  function addCustom() {
    const skill = custom.trim();
    if (!skill) return;
    if (skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return setCustom('');
    if (full) return;
    onChange([...skills, skill]);
    setCustom('');
  }

  return (
    <View>
      <View style={styles.chips}>
        {suggestions.map((skill) => (
          <Chip
            key={skill}
            label={skills.includes(skill) ? `✓ ${skill}` : skill}
            accessibilityLabel={skill}
            selected={skills.includes(skill)}
            onPress={() => toggle(skill)}
          />
        ))}
        {own.map((skill) => (
          <Chip
            key={skill}
            label={`✓ ${skill} ✕`}
            accessibilityLabel={`${skill}, remove`}
            selected
            dashed
            onPress={() => toggle(skill)}
          />
        ))}
      </View>

      <View style={styles.customRow}>
        <View style={styles.flex}>
          <Input
            placeholder="+ Add your own skill"
            value={custom}
            onChangeText={setCustom}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={addCustom}
            maxLength={40}
          />
        </View>
        <Button
          title="Add"
          testID="skill-add"
          onPress={addCustom}
          disabled={!custom.trim() || full}
          style={styles.addButton}
          haptic={false}
        />
      </View>
      {full && (
        <Text variant="note" style={styles.counter}>
          You can add your own skills while fewer than {MAX_SKILLS} are selected.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 6 },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10 },
  addButton: {
    width: 'auto',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    boxShadow: 'none',
  },
  counter: { marginTop: 6, marginLeft: 2 },
});
