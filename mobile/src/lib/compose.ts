import { z } from 'zod';

import { normaliseLink } from '@/lib/postView';
import { getYouTubeId } from '@/lib/youtube';
import type { PostType } from '@/types/post';

// Rules from nexusnetwork/src/pages/Post.jsx and server/routes/posts.js + models/Post.js.
// YouTube links: getYouTubeId (src/lib/youtube.ts), the same rule as the server.

export const MIN_POST = 5; // server: 'Post too short'
export const MAX_POST = 1000; // Post model maxlength
export const MAX_TAGS = 5;
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // server/config/cloudinary.js pdfUpload limit
export const IMAGE_MAX_WIDTH = 1200; // web compressImage
export const IMAGE_QUALITY = 0.82;

export const COMPOSE_TITLE = 'Share with campus ✍️';
export const COMPOSE_SUBTITLE = 'Your post reaches everyone in your college';

/** Web Post.jsx textarea placeholders, verbatim. */
export function placeholderFor(type: PostType): string {
  switch (type) {
    case 'placement':
      return 'Share placement experience, tips, or opportunity…';
    case 'qa':
      return 'Ask your question. More detail = better answers.';
    case 'study':
      return 'Share notes, PDF link, or study resource. Add a Google Drive or GitHub link below.';
    case 'project':
      return 'Describe your project, what you built…';
    case 'social':
      return 'Share a useful tip or insight social life just chill and share anything…';
    default:
      return "Say what you feel. No one will know it's you 🤫";
  }
}

/** Web: split on commas or spaces, strip a leading #, drop empties, de-duplicate, keep 5. */
export function cleanTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter((t) => t.length > 0),
    ),
  ].slice(0, MAX_TAGS);
}

export const youtubePreview = (id: string): string =>
  `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

export type ComposeValues = {
  type: PostType;
  text: string;
  anonymous: boolean;
  todayOnly: boolean;
  tags: string;
  link: string;
  youtubeUrl: string;
  imageUrl: string;
  pdf: { url: string; name: string; size: number } | null;
};

/** What POST /api/posts receives (same fields the web sends). */
export type CreatePostBody = {
  type: PostType;
  text: string;
  imageUrl: string;
  youtubeUrl: string;
  pdfUrl: string;
  pdfName: string;
  pdfSize: number;
  link: string;
  tags: string[];
  todayOnly: boolean;
  isAnonymous: boolean;
};

const POST_TYPES = ['social', 'placement', 'qa', 'study', 'project', 'confession'] as const;

/** Validates the form; the first issue is the message to show (like the web's toasts). */
export const composeSchema = z
  .object({
    type: z.enum(POST_TYPES),
    text: z.string(),
    anonymous: z.boolean(),
    todayOnly: z.boolean(),
    tags: z.string(),
    link: z.string(),
    youtubeUrl: z.string(),
    imageUrl: z.string(),
    pdf: z.object({ url: z.string(), name: z.string(), size: z.number() }).nullable(),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    const text = v.text.trim();
    if (!text) return fail('Write something first', 'text');
    if (text.length < MIN_POST) return fail('Too short — at least 5 characters', 'text');
    if (text.length > MAX_POST) return fail('Too long — at most 1000 characters', 'text');
    const yt = v.youtubeUrl.trim();
    if (yt && !getYouTubeId(yt))
      return fail("That doesn't look like a YouTube video link", 'youtubeUrl');
    if (yt && v.imageUrl) return fail('Choose either image or YouTube video', 'youtubeUrl');
    if (v.link.trim() && !normaliseLink(v.link.trim())) return fail('Enter a valid link', 'link');
  });

/** Turns valid form values into the request body (web handlePublish). */
export function buildCreatePostBody(v: ComposeValues): CreatePostBody {
  const link = v.link.trim();
  return {
    type: v.type,
    text: v.text.trim(),
    imageUrl: v.imageUrl,
    youtubeUrl: v.youtubeUrl.trim(),
    pdfUrl: v.pdf?.url ?? '',
    pdfName: v.pdf?.name ?? '',
    pdfSize: v.pdf?.size ?? 0,
    link: link ? (normaliseLink(link) ?? '') : '',
    tags: cleanTags(v.tags),
    todayOnly: v.todayOnly,
    isAnonymous: v.anonymous || v.type === 'confession',
  };
}

/** "Post as Anonymous →" / "Post as You →" (web). */
export const submitLabel = (v: Pick<ComposeValues, 'anonymous' | 'type'>): string =>
  `Post as ${v.anonymous || v.type === 'confession' ? 'Anonymous' : 'You'} →`;
