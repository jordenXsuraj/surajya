import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { uploadPostImage, uploadPostPdf } from '@/api/endpoints/posts';
import { insertNewPost } from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import { toUploadError, UploadCancelled } from '@/lib/upload';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, sessionUser } from '@/test/helpers';
import type { Post } from '@/types/post';

const photo = { uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };
const pdf = { uri: 'file:///cache/notes.pdf', name: 'notes.pdf', type: 'application/pdf' };

// Jest runs Node's FormData (React Native's has getParts instead): check the field by name
const hasField = (data: unknown, field: string) => (data as FormData).has(field);

beforeEach(() => {
  resetAll();
  useAuthStore.getState().signIn('tok', sessionUser());
});

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected a failure');
}

describe('upload helper', () => {
  it('sends multipart with the right field to the right route', async () => {
    const calls = mockApi(() => ({
      status: 200,
      data: { url: 'https://res.cloudinary.com/demo/x.jpg' },
    }));
    await expect(uploadPostImage(photo)).resolves.toEqual({
      url: 'https://res.cloudinary.com/demo/x.jpg',
    });
    expect(calls[0]?.url).toBe('/posts/upload-image');
    expect(calls[0]?.timeout).toBe(120_000);
    expect(hasField(calls[0]?.data, 'image')).toBe(true);

    const pdfCalls = mockApi(() => ({
      status: 200,
      data: { url: 'u', name: 'notes.pdf', size: 10 },
    }));
    await uploadPostPdf(pdf);
    expect(pdfCalls[0]?.url).toBe('/posts/upload-pdf');
    expect(hasField(pdfCalls[0]?.data, 'pdf')).toBe(true);
  });

  it("passes the server's message through (type / size refused)", async () => {
    mockApi(() => ({
      status: 400,
      data: { code: 'FILE_TOO_LARGE', message: 'Image is too large (max 5 MB)' },
    }));
    expect((await failure(uploadPostImage(photo))).message).toBe('Image is too large (max 5 MB)');

    mockApi(() => ({
      status: 400,
      data: {
        code: 'INVALID_FILE_TYPE',
        message: 'Only image files allowed (JPG, PNG, WebP, HEIC)',
      },
    }));
    expect((await failure(uploadPostImage(photo))).message).toBe(
      'Only image files allowed (JPG, PNG, WebP, HEIC)',
    );
  });

  it('no connection and timeouts get the web wording', async () => {
    mockApi(() => 'network');
    expect((await failure(uploadPostPdf(pdf))).message).toBe(
      'Network error. Check your connection.',
    );
    mockApi(() => 'timeout');
    expect((await failure(uploadPostPdf(pdf))).message).toBe('Upload timed out. Try again.');
  });

  it('a cancelled upload is UploadCancelled, not an error to show', async () => {
    mockApi(() => ({ status: 200, data: { url: 'never' } }));
    const controller = new AbortController();
    controller.abort();
    expect(await failure(uploadPostImage(photo, { signal: controller.signal }))).toBeInstanceOf(
      UploadCancelled,
    );
  });

  it('server errors without a message still read well', async () => {
    mockApi(() => ({ status: 500, data: undefined }));
    expect((await failure(uploadPostImage(photo))).message).toBe(
      'Something went wrong. Please try again.',
    );
    expect(toUploadError('weird').message).toBe('Upload failed');
  });
});

describe('insertNewPost', () => {
  const page = (posts: Post[]): InfiniteData<Post[], number> => ({
    pages: [posts, []],
    pageParams: [1, 2],
  });
  const existing = { _id: 'old', type: 'social' } as Post;
  const mine = { _id: 'new', type: 'qa', text: 'hello' } as Post;

  it('goes on top of page 1 of matching Home feeds and my posts, not Following', () => {
    const qc = new QueryClient();
    const keys = {
      globalAll: queryKeys.feed('global', 'all'),
      collegeAll: queryKeys.feed('college', 'all'),
      collegeQa: queryKeys.feed('college', 'qa'),
      globalSocial: queryKeys.feed('global', 'social'),
      following: queryKeys.feed('following', 'all'),
    };
    for (const key of Object.values(keys)) qc.setQueryData(key, page([existing]));
    qc.setQueryData(queryKeys.myPosts, page([existing]));

    insertNewPost(qc, mine);

    const first = (key: readonly unknown[]) =>
      qc.getQueryData<InfiniteData<Post[], number>>(key)!.pages[0]!.map((p) => p._id);
    expect(first(keys.globalAll)).toEqual(['new', 'old']);
    expect(first(keys.collegeAll)).toEqual(['new', 'old']);
    expect(first(keys.collegeQa)).toEqual(['new', 'old']);
    expect(first(keys.globalSocial)).toEqual(['old']); // other type
    expect(first(keys.following)).toEqual(['old']); // only other people's posts
    expect(first(queryKeys.myPosts)).toEqual(['new', 'old']);

    insertNewPost(qc, mine); // never twice
    expect(first(keys.globalAll)).toEqual(['new', 'old']);
  });
});
