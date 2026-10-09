import { create } from 'zustand';

import type { PhotoKind } from '@/lib/crop';
import type { UploadFile } from '@/lib/upload';

// Profile photo / cover: the picked photo waiting on the crop screen, and the uploads in progress
// (they keep going after the crop screen closes, so the Me tab shows their progress).

export type CropSource = { kind: PhotoKind; uri: string; width: number; height: number };

export type PhotoUpload =
  | { status: 'uploading'; localUri: string; progress: number; file: UploadFile }
  | { status: 'error'; localUri: string; message: string; file: UploadFile };

type ProfilePhotoState = {
  crop: CropSource | null;
  uploads: Partial<Record<PhotoKind, PhotoUpload>>;
  setCrop: (crop: CropSource | null) => void;
  setUpload: (kind: PhotoKind, upload: PhotoUpload | null) => void;
  setProgress: (kind: PhotoKind, progress: number) => void;
  reset: () => void;
};

export const useProfilePhotoStore = create<ProfilePhotoState>()((set) => ({
  crop: null,
  uploads: {},
  setCrop: (crop) => set({ crop }),
  setUpload: (kind, upload) =>
    set((s) => {
      const uploads = { ...s.uploads };
      if (upload) uploads[kind] = upload;
      else delete uploads[kind];
      return { uploads };
    }),
  setProgress: (kind, progress) =>
    set((s) => {
      const current = s.uploads[kind];
      return current?.status === 'uploading'
        ? { uploads: { ...s.uploads, [kind]: { ...current, progress } } }
        : s;
    }),
  reset: () => set({ crop: null, uploads: {} }),
}));
