import type { ColorName } from '@/theme/tokens';
import type { PostType } from '@/types/post';

// From nexusnetwork/src/pages/Post.jsx (POST_TYPES) and PostCard.jsx (TYPE_TAG), same order.
// Copy differs from the web where the web has typos (study/project labels, descriptions, tags);
// the web gets the same fix separately.

export type PostTypeInfo = {
  id: PostType;
  em: string;
  label: string;
  desc: string;
  /** Feed tag text (TYPE_TAG). */
  tag: string;
  color: ColorName;
  tint: ColorName;
};

export const POST_TYPES: readonly PostTypeInfo[] = [
  {
    id: 'placement',
    em: '💼',
    label: 'Placement',
    desc: 'Interview exp, jobs, tips, internship, help',
    tag: '💼 Placement',
    color: 'blue',
    tint: 'bl',
  },
  {
    id: 'social',
    em: '🔥',
    label: 'Social',
    desc: 'Hackathon, Events, Achievements, Announcements',
    tag: '🔥 Social',
    color: 'orange',
    tint: 'ol',
  },
  {
    id: 'confession',
    em: '🤫',
    label: 'Confession',
    desc: 'Anonymous, private, safe',
    tag: '🤫 Confession',
    color: 'accent',
    tint: 'al',
  },
  {
    id: 'study',
    em: '📚',
    label: 'Study Material',
    desc: 'Share what you have that helps others',
    tag: '📚 Study Material',
    color: 'green',
    tint: 'gl',
  },
  {
    id: 'qa',
    em: '❓',
    label: 'Q&A',
    desc: 'Ask anything, get answers',
    tag: '❓ Q&A',
    color: 'purple',
    tint: 'pl',
  },
  {
    id: 'project',
    em: '🚀/🤝',
    label: 'Project / Need Partner',
    desc: 'Find project teammates, share what you built',
    tag: '🚀 Project / Partner',
    color: 'yellow',
    tint: 'yl',
  },
];

export function postTypeInfo(type: PostType): PostTypeInfo {
  return POST_TYPES.find((t) => t.id === type) ?? POST_TYPES[0]!;
}
