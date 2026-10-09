import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { openWebPage } from '@/lib/links';
import { normaliseLink } from '@/lib/postView';
import type { ProfileData } from '@/lib/profile';
import { decodeEntities } from '@/lib/text';
import { colors, fonts, radius, touch } from '@/theme/tokens';

type ProfileSectionsProps = {
  profile: Pick<ProfileData, 'skills' | 'projects' | 'roadmap'>;
  isMe: boolean;
  /** Me: "+ Edit" / "+ Add" open the edit form. */
  onEdit?: () => void;
};

// Web .prof-section: Skills (badges), Projects (🚀 cards, the link opens), Roadmap. My own profile
// shows the empty texts and edit links; someone else's hides empty sections (StudentProfile.jsx).
export function ProfileSections({ profile, isMe, onEdit }: ProfileSectionsProps) {
  const skills = profile.skills ?? [];
  const projects = profile.projects ?? [];
  const roadmap = decodeEntities(profile.roadmap ?? '').trim();

  return (
    <View style={styles.root}>
      {(isMe || skills.length > 0) && (
        <Section title="Skills" action={isMe ? '+ Edit' : undefined} onAction={onEdit}>
          {skills.length > 0 ? (
            <View style={styles.skills}>
              {skills.map((s) => (
                <View key={s} style={styles.skill}>
                  <Text style={styles.skillText}>{decodeEntities(s)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No skills yet</Text>
          )}
        </Section>
      )}

      {(isMe || projects.length > 0) && (
        <Section title="Projects" action={isMe ? '+ Add' : undefined} onAction={onEdit}>
          {projects.length > 0 ? (
            projects.map((p, i) => (
              <ProjectCard key={`${p.name}-${i}`} name={p.name} link={p.link} />
            ))
          ) : (
            <Text style={styles.empty}>No projects</Text>
          )}
        </Section>
      )}

      {(isMe || roadmap.length > 0) && (
        <Section title="Roadmap" action={isMe ? '+ Edit' : undefined} onAction={onEdit}>
          {roadmap ? (
            <View style={styles.roadmap}>
              <Text style={styles.roadmapText}>{roadmap}</Text>
            </View>
          ) : (
            <Text style={styles.empty}>No roadmap yet</Text>
          )}
        </Section>
      )}
    </View>
  );
}

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {action && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={`${action.replace('+ ', '')} ${title.toLowerCase()}`}
            hitSlop={touch.hitSlop}
          >
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ProjectCard({ name, link }: { name: string; link?: string }) {
  const url = link ? normaliseLink(decodeEntities(link)) : null;
  return (
    <Pressable
      onPress={url ? () => void openWebPage(url) : undefined}
      disabled={!url}
      accessibilityRole={url ? 'link' : 'text'}
      style={({ pressed }) => [styles.project, pressed && url && styles.pressed]}
    >
      <View style={styles.projectIcon}>
        <Text style={styles.projectEmoji}>🚀</Text>
      </View>
      <View style={styles.projectText}>
        <Text style={styles.projectName}>{decodeEntities(name)}</Text>
        {link ? (
          <Text style={styles.projectLink} numberOfLines={1}>
            {decodeEntities(link)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  section: { paddingHorizontal: 15, paddingBottom: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.text },
  sectionAction: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.accent },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  skill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.br2,
    backgroundColor: colors.br,
  },
  skillText: { fontFamily: fonts.bold, fontSize: 11.7, color: colors.muted },
  empty: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.dim },
  project: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: touch.min,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  projectIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.bl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectEmoji: { fontSize: 16 },
  projectText: { flex: 1, minWidth: 0 },
  projectName: { fontFamily: fonts.bold, fontSize: 13.1, color: colors.text },
  projectLink: { fontFamily: fonts.regular, fontSize: 11, color: colors.blue, marginTop: 1 },
  roadmap: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  roadmapText: { fontFamily: fonts.regular, fontSize: 13.1, color: colors.muted, lineHeight: 21 },
  pressed: { opacity: 0.75 },
});
