import { cloudinaryUrl } from '@/lib/cloudinary';
import {
  applyLikeResponse,
  isAnonAuthorReply,
  isLikedBy,
  isOwnReply,
  matchesSearch,
  normaliseLink,
  pdfSizeLabel,
  pdfViewerUrl,
  replyAuthorName,
  replyCountOf,
  toggleLike,
} from '@/lib/postView';
import { hoursLeft, timeAgo, todayOnlyLabel } from '@/lib/time';
import { getYouTubeId, youTubeThumbnail } from '@/lib/youtube';
import type { Post, Reply } from '@/types/post';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

describe('timeAgo (web)', () => {
  it.each([
    [0, 'just now'],
    [59 * 60_000, 'just now'],
    [H, '1h ago'],
    [23 * H + 59 * 60_000, '23h ago'],
    [24 * H, '1d ago'],
    [9 * 24 * H, '9d ago'],
  ])('%i ms ago → %s', (ms, label) => {
    expect(timeAgo(ago(ms), NOW)).toBe(label);
  });

  it('Today Only countdown rounds up and never goes negative', () => {
    expect(hoursLeft(new Date(NOW + 5.2 * H).toISOString(), NOW)).toBe(6);
    expect(hoursLeft(new Date(NOW - H).toISOString(), NOW)).toBe(0);
    expect(todayOnlyLabel(new Date(NOW + 23 * H).toISOString(), NOW)).toBe(
      '⏳ 23h left · Today Only',
    );
  });
});

describe('cloudinaryUrl', () => {
  const base = 'https://res.cloudinary.com/demo/image/upload/v17/nexus/post_1.jpg';

  it('inserts w_720,q_auto,f_auto after /upload/', () => {
    expect(cloudinaryUrl(base)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_720,q_auto,f_auto/v17/nexus/post_1.jpg',
    );
  });

  it('uses the requested width (rounded)', () => {
    expect(cloudinaryUrl(base, { width: 114.6 })).toContain('/upload/w_115,q_auto,f_auto/v17/');
  });

  it('does not stack the same transformation twice', () => {
    const once = cloudinaryUrl(base);
    expect(cloudinaryUrl(once)).toBe(once);
  });

  it('leaves other URLs alone (other hosts, raw files like PDFs, empty)', () => {
    expect(cloudinaryUrl('https://img.youtube.com/vi/x/mqdefault.jpg')).toBe(
      'https://img.youtube.com/vi/x/mqdefault.jpg',
    );
    const pdf = 'https://res.cloudinary.com/demo/raw/upload/v3/meetnet_pdfs/pdf_1';
    expect(cloudinaryUrl(pdf)).toBe(pdf);
    expect(cloudinaryUrl(undefined)).toBe('');
  });
});

describe('YouTube ids (web patterns)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/abc123XYZ', 'abc123XYZ'],
    ['https://vimeo.com/123', null],
    ['', null],
  ])('%s → %s', (url, id) => {
    expect(getYouTubeId(url)).toBe(id);
  });

  it('thumbnail is mqdefault', () => {
    expect(youTubeThumbnail('abc')).toBe('https://img.youtube.com/vi/abc/mqdefault.jpg');
  });
});

const basePost: Post = {
  _id: 'p1',
  type: 'social',
  text: 'Hello <world>',
  tags: ['DSA', 'Placement'],
  link: '',
  pdfName: '',
  pdfSize: 0,
  isAnonymous: false,
  college: 'PICT',
  createdAt: ago(H),
  postedBy: { _id: 'a1', name: 'Asha Patil' },
  likes: ['u2'],
  likeCount: 1,
  replies: [],
};

describe('likes (web postView.js)', () => {
  it('toggleLike keeps likes, likeCount and likedByMe in sync', () => {
    const liked = toggleLike(basePost, 'me');
    expect(liked).toMatchObject({ likeCount: 2, likedByMe: true, likes: ['u2', 'me'] });
    expect(toggleLike(liked, 'me')).toMatchObject({
      likeCount: 1,
      likedByMe: false,
      likes: ['u2'],
    });
  });

  it('likedByMe wins over the likes list (anonymous posts hide the author id)', () => {
    expect(isLikedBy({ likedByMe: true, likes: [] }, 'me')).toBe(true);
    expect(isLikedBy({ likes: ['me'] }, 'me')).toBe(true);
  });

  it('applyLikeResponse takes the server values', () => {
    expect(
      applyLikeResponse(basePost, { liked: true, count: 7, likeCount: 7, likes: ['a', 'b'] }),
    ).toMatchObject({
      likeCount: 7,
      likedByMe: true,
      likes: ['a', 'b'],
    });
  });
});

describe('replies and search', () => {
  const anonAuthorReply: Reply = {
    _id: 'r1',
    text: 'me',
    createdAt: ago(0),
    postedBy: null,
    isAuthor: true,
    isMine: true,
  };

  it('anonymous author replies are "Anonymous (author)" and recognised as mine', () => {
    expect(isAnonAuthorReply(anonAuthorReply)).toBe(true);
    expect(replyAuthorName(anonAuthorReply)).toBe('Anonymous (author)');
    expect(isOwnReply(anonAuthorReply, 'someone')).toBe(true);
    expect(
      isOwnReply(
        { ...anonAuthorReply, isMine: undefined, postedBy: { _id: 'u1', name: 'U' } },
        'u1',
      ),
    ).toBe(true);
  });

  it('reply count: loaded replies when fewer than 5, otherwise the larger of loaded and replyCount', () => {
    const replies = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...anonAuthorReply, _id: `r${i}` }));
    expect(replyCountOf({ replies: replies(3), replyCount: 9 })).toBe(3);
    expect(replyCountOf({ replies: replies(5), replyCount: 12 })).toBe(12);
    expect(replyCountOf({ replies: replies(5), replyCount: undefined })).toBe(5);
  });

  it('search matches text, tags and named authors — never anonymous authors', () => {
    expect(matchesSearch(basePost, 'hello')).toBe(true);
    expect(matchesSearch(basePost, 'placem')).toBe(true);
    expect(matchesSearch(basePost, 'asha')).toBe(true);
    expect(matchesSearch({ ...basePost, isAnonymous: true }, 'asha')).toBe(false);
    expect(matchesSearch(basePost, '  ')).toBe(true);
    expect(matchesSearch(basePost, 'zzz')).toBe(false);
  });
});

describe('links and PDFs', () => {
  it('adds https:// and refuses other schemes', () => {
    expect(normaliseLink('github.com/x')).toBe('https://github.com/x');
    expect(normaliseLink('http://x.dev')).toBe('http://x.dev');
    expect(normaliseLink('javascript:alert(1)')).toBe(null);
  });

  it('PDF size label and viewer URL like the web', () => {
    expect(pdfSizeLabel(0)).toBe('PDF');
    expect(pdfSizeLabel(153_600)).toBe('PDF · 150 KB');
    expect(pdfViewerUrl('https://res.cloudinary.com/x/raw/upload/a b')).toBe(
      'https://docs.google.com/viewer?url=https%3A%2F%2Fres.cloudinary.com%2Fx%2Fraw%2Fupload%2Fa%20b&embedded=true',
    );
  });
});
