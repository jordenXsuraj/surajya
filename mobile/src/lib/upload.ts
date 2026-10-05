import type { AxiosProgressEvent } from 'axios';

import { request } from '@/api/client';

// Multipart uploads (avatar, cover, post image/PDF) — used from Prompt 4 on.
export type UploadFile = { uri: string; name: string; type: string };

export function uploadFile<T>(
  url: string,
  field: string,
  file: UploadFile,
  extra: Record<string, string> = {},
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } for files.
  form.append(field, file as unknown as Blob);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);

  return request<T>({
    method: 'POST',
    url,
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
    onUploadProgress: (event: AxiosProgressEvent) => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    },
  });
}
