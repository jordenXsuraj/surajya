import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';

import { uploadAvatar, uploadCover } from '@/api/endpoints/users';
import { updateAuthor } from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import { cropRect, PHOTO_OUTPUT, type PhotoKind, type Point, type Size } from '@/lib/crop';
import { pickImage } from '@/lib/pickImage';
import { UploadCancelled, type UploadFile } from '@/lib/upload';
import { useAuthStore } from '@/stores/auth.store';
import { useProfilePhotoStore } from '@/stores/profilePhoto.store';
import { useUiStore } from '@/stores/ui.store';
import type { Me } from '@/types/user';

// Profile photo and cover: pick → crop screen (1:1 / 3:1) → resize (600×600 / 1500×500, JPEG,
// which also turns HEIC into JPEG) → upload with progress → the new photo everywhere at once
// (Me, the session, my posts in every list). Toasts are the web's.

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

const QUALITY = 0.82;
/** Very large photos are scaled down before cropping (memory); the crop is still ≥ 1500 px wide. */
const MAX_SOURCE_SIDE = 3000;

const DONE: Record<PhotoKind, string> = {
  avatar: '✅ Profile photo updated!',
  cover: '✅ Cover updated!',
};

const controllers: Partial<Record<PhotoKind, AbortController>> = {};

/**
 * Re-encodes the picked photo once (applies the EXIF rotation, decodes HEIC, limits the size), so
 * the crop screen and the final crop work on exactly the same pixels.
 */
async function prepareForCrop(uri: string, size: Size): Promise<Size & { uri: string }> {
  const context = ImageManipulator.manipulate(uri);
  const longest = Math.max(size.width, size.height);
  if (longest > MAX_SOURCE_SIDE) {
    context.resize(
      size.width >= size.height ? { width: MAX_SOURCE_SIDE } : { height: MAX_SOURCE_SIDE },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** The final file: the framed part of the photo at the output size. */
export async function cropPhoto(
  kind: PhotoKind,
  source: Size & { uri: string },
  frame: Size,
  zoom: number,
  offset: Point,
): Promise<UploadFile> {
  const context = ImageManipulator.manipulate(source.uri);
  context.crop(cropRect(source, frame, zoom, offset));
  context.resize(PHOTO_OUTPUT[kind]);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, name: `${kind}-${Date.now()}.jpg`, type: 'image/jpeg' };
}

async function runUpload(qc: QueryClient, kind: PhotoKind, file: UploadFile): Promise<void> {
  const store = useProfilePhotoStore.getState();
  controllers[kind]?.abort();
  const controller = new AbortController();
  controllers[kind] = controller;
  store.setUpload(kind, { status: 'uploading', localUri: file.uri, progress: 0, file });
  try {
    const options = {
      signal: controller.signal,
      onProgress: (p: number) => useProfilePhotoStore.getState().setProgress(kind, p),
    };
    const url =
      kind === 'avatar'
        ? (await uploadAvatar(file, options)).avatar
        : (await uploadCover(file, options)).coverImage;
    if (controllers[kind] !== controller) return;
    const patch = kind === 'avatar' ? { avatar: url } : { coverImage: url };
    qc.setQueryData<Me>(queryKeys.me, (me) => (me ? { ...me, ...patch } : me));
    useAuthStore.getState().updateUser(patch);
    const myId = useAuthStore.getState().user?._id;
    if (kind === 'avatar' && myId) updateAuthor(qc, String(myId), { avatar: url });
    useProfilePhotoStore.getState().setUpload(kind, null);
    toast(DONE[kind], 'success');
  } catch (error) {
    if (error instanceof UploadCancelled || controllers[kind] !== controller) return;
    const message = error instanceof Error ? error.message : 'Upload failed';
    useProfilePhotoStore
      .getState()
      .setUpload(kind, { status: 'error', localUri: file.uri, message, file });
    toast(`❌ ${message}`, 'error');
  } finally {
    if (controllers[kind] === controller) delete controllers[kind];
  }
}

export function useProfilePhoto() {
  const qc = useQueryClient();
  const uploads = useProfilePhotoStore((s) => s.uploads);

  /** Library or camera → the crop screen. */
  async function choose(kind: PhotoKind, source: 'camera' | 'library') {
    const asset = await pickImage(source, 'profile');
    if (!asset) return;
    try {
      const prepared = await prepareForCrop(asset.uri, asset);
      useProfilePhotoStore.getState().setCrop({ kind, ...prepared });
      router.push('/crop');
    } catch {
      toast('❌ Could not read image', 'error');
    }
  }

  /** From the crop screen ("Use photo"). */
  function upload(kind: PhotoKind, file: UploadFile) {
    void runUpload(qc, kind, file);
  }

  function retry(kind: PhotoKind) {
    const current = useProfilePhotoStore.getState().uploads[kind];
    if (current?.status === 'error') void runUpload(qc, kind, current.file);
  }

  function dismissError(kind: PhotoKind) {
    if (useProfilePhotoStore.getState().uploads[kind]?.status === 'error') {
      useProfilePhotoStore.getState().setUpload(kind, null);
    }
  }

  return { uploads, choose, upload, retry, dismissError };
}
