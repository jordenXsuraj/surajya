import type { AxiosProgressEvent } from 'axios';

import { request } from '@/api/client';
import { ApiError, UserError } from '@/api/errors';

// Multipart uploads to the API (post image/PDF; avatar and cover later).
export type UploadFile = { uri: string; name: string; type: string };

export const UPLOAD_TIMEOUT_MS = 120_000;

/** Thrown when the upload was stopped on purpose (✕ while uploading). Not an error to show. */
export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelled';
  }
}

/** Readable messages for upload failures (web Post.jsx wording where it has one). */
export function toUploadError(error: unknown): Error {
  if (error instanceof UploadCancelled) return error;
  if (error instanceof ApiError) {
    if (error.code === 'CANCELLED') return new UploadCancelled();
    if (error.status === 0) {
      if (error.code === 'OFFLINE')
        return new UserError('You are offline. Try again when connected.');
      return new UserError(
        /too long|timed out/i.test(error.message)
          ? 'Upload timed out. Try again.'
          : 'Network error. Check your connection.',
      );
    }
    if (error.status >= 500) return new UserError('Upload failed. Try again.');
    // 400 INVALID_FILE_TYPE / FILE_TOO_LARGE etc. carry a message meant for the user
    return new UserError(error.message || 'Upload failed');
  }
  if (error instanceof UserError) return error;
  // A native module's or JavaScript error: never shown as it is
  if (__DEV__ && process.env.NODE_ENV !== 'test') console.warn('[upload] failed:', error);
  return new UserError('Upload failed');
}

type UploadOptions = {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export async function uploadFile<T>(
  url: string,
  field: string,
  file: UploadFile,
  { onProgress, signal }: UploadOptions = {},
): Promise<T> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } for files.
  form.append(field, file as unknown as Blob);

  try {
    return await request<T>({
      method: 'POST',
      url,
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
      signal,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (onProgress && event.total) onProgress(Math.min(1, event.loaded / event.total));
      },
    });
  } catch (error) {
    throw toUploadError(error);
  }
}
