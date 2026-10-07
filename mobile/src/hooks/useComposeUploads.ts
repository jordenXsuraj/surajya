import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { uploadPostImage, uploadPostPdf } from '@/api/endpoints/posts';
import { IMAGE_MAX_WIDTH, IMAGE_QUALITY, MAX_PDF_BYTES } from '@/lib/compose';
import { UploadCancelled, type UploadFile } from '@/lib/upload';
import { useUiStore } from '@/stores/ui.store';

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

// ── Photo ──────────────────────────────────────────────────────────────────────────────────

export type PhotoState =
  | { status: 'idle' }
  | { status: 'compressing'; localUri: string }
  | { status: 'uploading'; localUri: string; progress: number }
  | { status: 'done'; localUri: string; url: string }
  | {
      status: 'error';
      localUri: string;
      message: string;
      file: UploadFile | null;
      sourceUri: string;
    };

/** Web compressImage: max 1200 px wide, JPEG 0.82. Re-encoding also turns HEIC into JPEG. */
export async function compressPhoto(asset: { uri: string; width: number }): Promise<UploadFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > IMAGE_MAX_WIDTH) context.resize({ width: IMAGE_MAX_WIDTH });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: IMAGE_QUALITY, format: SaveFormat.JPEG });
  return { uri: result.uri, name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' };
}

async function cameraAllowed(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    Alert.alert(
      'Camera access is off',
      'Turn on camera access for MeetNet in Settings to take a photo for your post.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  }
  const proceed = await new Promise<boolean>((resolve) =>
    Alert.alert('Use the camera?', 'MeetNet uses the camera only to take a photo for this post.', [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]),
  );
  if (!proceed) return false;
  return (await ImagePicker.requestCameraPermissionsAsync()).granted;
}

export function usePhotoUpload(initialUrl = '') {
  const [state, setState] = useState<PhotoState>(
    initialUrl ? { status: 'done', localUri: initialUrl, url: initialUrl } : { status: 'idle' },
  );
  const abortRef = useRef<AbortController | null>(null);

  async function upload(file: UploadFile, sourceUri: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'uploading', localUri: sourceUri, progress: 0 });
    try {
      const { url } = await uploadPostImage(file, {
        signal: controller.signal,
        onProgress: (p) => setState((s) => (s.status === 'uploading' ? { ...s, progress: p } : s)),
      });
      if (abortRef.current !== controller) return; // replaced or removed meanwhile
      setState({ status: 'done', localUri: sourceUri, url });
      toast('✅ Image ready!', 'success');
    } catch (error) {
      if (error instanceof UploadCancelled || abortRef.current !== controller) return;
      const message = error instanceof Error ? error.message : 'Upload failed';
      setState({ status: 'error', localUri: sourceUri, message, file, sourceUri });
      toast(`❌ ${message}`, 'error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function processAsset(asset: ImagePicker.ImagePickerAsset) {
    setState({ status: 'compressing', localUri: asset.uri });
    let file: UploadFile;
    try {
      file = await compressPhoto(asset);
    } catch {
      setState({
        status: 'error',
        localUri: asset.uri,
        message: 'Could not read image',
        file: null,
        sourceUri: asset.uri,
      });
      toast('❌ Could not read image', 'error');
      return;
    }
    await upload(file, asset.uri);
  }

  async function pick(source: 'camera' | 'library') {
    if (source === 'camera' && !(await cameraAllowed())) return;
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      toast('⚠️ Only image files allowed', 'error');
      return;
    }
    await processAsset(asset);
  }

  function retry() {
    if (state.status !== 'error') return;
    if (state.file) void upload(state.file, state.sourceUri);
    else
      void processAsset({
        uri: state.sourceUri,
        width: IMAGE_MAX_WIDTH + 1,
      } as ImagePicker.ImagePickerAsset);
  }

  function remove() {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: 'idle' });
  }

  return { state, pick, retry, remove, url: state.status === 'done' ? state.url : '' };
}

// ── PDF ────────────────────────────────────────────────────────────────────────────────────

export type PdfState =
  | { status: 'idle' }
  | { status: 'uploading'; name: string; size: number; progress: number }
  | { status: 'done'; name: string; size: number; url: string }
  | { status: 'error'; name: string; size: number; message: string; file: UploadFile };

type PdfInitial = { url: string; name: string; size: number } | null;

export function usePdfUpload(initial: PdfInitial = null) {
  const [state, setState] = useState<PdfState>(
    initial ? { status: 'done', ...initial } : { status: 'idle' },
  );
  const abortRef = useRef<AbortController | null>(null);

  async function upload(file: UploadFile, size: number) {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'uploading', name: file.name, size, progress: 0 });
    try {
      const data = await uploadPostPdf(file, {
        signal: controller.signal,
        onProgress: (p) => setState((s) => (s.status === 'uploading' ? { ...s, progress: p } : s)),
      });
      if (abortRef.current !== controller) return;
      setState({
        status: 'done',
        name: data.name || file.name,
        size: data.size || size,
        url: data.url,
      });
      toast('✅ PDF ready!', 'success');
    } catch (error) {
      if (error instanceof UploadCancelled || abortRef.current !== controller) return;
      const message = error instanceof Error ? error.message : 'Upload failed';
      setState({ status: 'error', name: file.name, size, message, file });
      toast(`❌ ${message}`, 'error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const isPdf = asset.mimeType === 'application/pdf' || /\.pdf$/i.test(asset.name);
    if (!isPdf) {
      toast('⚠️ Only PDF files allowed', 'error');
      return;
    }
    if ((asset.size ?? 0) > MAX_PDF_BYTES) {
      toast('⚠️ PDF must be under 10 MB', 'error');
      return;
    }
    await upload({ uri: asset.uri, name: asset.name, type: 'application/pdf' }, asset.size ?? 0);
  }

  function retry() {
    if (state.status === 'error') void upload(state.file, state.size);
  }

  function remove() {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: 'idle' });
  }

  return {
    state,
    pick,
    retry,
    remove,
    value: state.status === 'done' ? { url: state.url, name: state.name, size: state.size } : null,
  };
}
