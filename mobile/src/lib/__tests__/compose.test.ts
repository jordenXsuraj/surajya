import {
  buildCreatePostBody,
  cleanTags,
  composeSchema,
  placeholderFor,
  submitLabel,
  youtubePreview,
  type ComposeValues,
} from '@/lib/compose';
import {
  clearDraft,
  DRAFT_KEY,
  EMPTY_DRAFT,
  isEmptyDraft,
  loadDraft,
  saveDraft,
} from '@/lib/composeDraft';
import { getStorage } from '@/lib/storage';
import { resetAll } from '@/test/helpers';

const base: ComposeValues = { ...EMPTY_DRAFT, text: 'Hello campus!' };
const issue = (v: Partial<ComposeValues>) => {
  const r = composeSchema.safeParse({ ...base, ...v });
  return r.success ? null : r.error.issues[0]?.message;
};

describe('cleanTags (web Post.jsx)', () => {
  it('splits on commas and spaces, strips #, drops empties', () => {
    expect(cleanTags('DSA, placement, TCS')).toEqual(['DSA', 'placement', 'TCS']);
    expect(cleanTags('#react  #node,,#  mongo')).toEqual(['react', 'node', 'mongo']);
    expect(cleanTags(' , ,  ')).toEqual([]);
  });

  it('de-duplicates exactly (case-sensitive, like the web) and keeps 5', () => {
    expect(cleanTags('a, b, a, #b, c, d, e, f, g')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(cleanTags('DSA dsa')).toEqual(['DSA', 'dsa']);
  });

  it('only strips one leading #', () => {
    expect(cleanTags('##double')).toEqual(['#double']);
  });
});

// Which links count as a YouTube video: src/lib/__tests__/youtube.test.ts
describe('YouTube preview', () => {
  it('compose preview thumbnail uses hqdefault', () => {
    expect(youtubePreview('abc')).toBe('https://img.youtube.com/vi/abc/hqdefault.jpg');
  });
});

describe('composeSchema', () => {
  it('accepts a normal post', () => {
    expect(issue({})).toBeNull();
  });

  it('text: required, at least 5 characters after trimming, at most 1000', () => {
    expect(issue({ text: '   ' })).toBe('Write something first');
    expect(issue({ text: '  abcd  ' })).toBe('Too short — at least 5 characters');
    expect(issue({ text: 'abcde' })).toBeNull();
    expect(issue({ text: 'x'.repeat(1000) })).toBeNull();
    expect(issue({ text: 'x'.repeat(1001) })).toBe('Too long — at most 1000 characters');
  });

  it('image and YouTube are mutually exclusive (server 400 otherwise)', () => {
    expect(issue({ imageUrl: 'https://res.cloudinary.com/x.jpg' })).toBeNull();
    expect(issue({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' })).toBeNull();
    expect(
      issue({
        imageUrl: 'https://res.cloudinary.com/x.jpg',
        youtubeUrl: 'https://youtube.com/shorts/dQw4w9WgXcQ',
      }),
    ).toBe('Choose either image or YouTube video');
  });

  it('YouTube links must point to a video (Shorts and live included)', () => {
    expect(issue({ youtubeUrl: 'https://youtube.com/shorts/dQw4w9WgXcQ' })).toBeNull();
    expect(issue({ youtubeUrl: 'https://www.youtube.com/live/dQw4w9WgXcQ' })).toBeNull();
    expect(issue({ youtubeUrl: 'https://www.youtube.com/@somechannel' })).toBe(
      "That doesn't look like a YouTube video link",
    );
  });

  it('links must be http(s); a missing scheme is fine', () => {
    expect(issue({ link: 'github.com/me' })).toBeNull();
    expect(issue({ link: 'javascript:alert(1)' })).toBe('Enter a valid link');
  });
});

describe('request body and labels', () => {
  it('builds what the web sends: trimmed, tags cleaned, https:// added', () => {
    const body = buildCreatePostBody({
      ...base,
      text: '  Hello campus!  ',
      tags: '#dsa, tcs',
      link: 'github.com/me',
      youtubeUrl: ' https://youtu.be/abc ',
      pdf: { url: 'https://res.cloudinary.com/raw/x', name: 'notes.pdf', size: 1234 },
      todayOnly: true,
    });
    expect(body).toEqual({
      type: 'social',
      text: 'Hello campus!',
      imageUrl: '',
      youtubeUrl: 'https://youtu.be/abc',
      pdfUrl: 'https://res.cloudinary.com/raw/x',
      pdfName: 'notes.pdf',
      pdfSize: 1234,
      link: 'https://github.com/me',
      tags: ['dsa', 'tcs'],
      todayOnly: true,
      isAnonymous: false,
    });
  });

  it('confession is always anonymous', () => {
    expect(buildCreatePostBody({ ...base, type: 'confession', anonymous: false }).isAnonymous).toBe(
      true,
    );
    expect(submitLabel({ type: 'confession', anonymous: false })).toBe('Post as Anonymous →');
    expect(submitLabel({ type: 'social', anonymous: true })).toBe('Post as Anonymous →');
    expect(submitLabel({ type: 'social', anonymous: false })).toBe('Post as You →');
  });

  it('placeholders come from the web, one per type', () => {
    expect(placeholderFor('qa')).toBe('Ask your question. More detail = better answers.');
    expect(placeholderFor('confession')).toBe("Say what you feel. No one will know it's you 🤫");
  });
});

describe('draft in MMKV', () => {
  beforeEach(() => resetAll());

  it('saves, restores and clears; empty drafts are not kept', () => {
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
    saveDraft({ ...EMPTY_DRAFT, type: 'qa', text: 'half-written question' });
    expect(loadDraft()).toMatchObject({ type: 'qa', text: 'half-written question' });
    saveDraft({ ...EMPTY_DRAFT, type: 'qa' });
    expect(getStorage().getString(DRAFT_KEY)).toBeUndefined();
    saveDraft({ ...EMPTY_DRAFT, text: 'again' });
    clearDraft();
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('type and toggles alone are not a draft', () => {
    expect(isEmptyDraft({ ...EMPTY_DRAFT, type: 'confession', todayOnly: true })).toBe(true);
    expect(isEmptyDraft({ ...EMPTY_DRAFT, tags: 'dsa' })).toBe(false);
  });
});
