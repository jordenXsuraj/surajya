import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import { useUiStore } from '@/stores/ui.store';

// Picking a photo from the library or the camera, shared by compose (post photo) and the profile
// (photo and cover). The library uses the system photo picker (no permission needed); the camera
// asks first, with a short explanation and a way to Settings when access was turned off.

/** What the photo is for, in the camera texts: "for your post" / "for your profile". */
export type PhotoPurpose = 'post' | 'profile';

async function cameraAllowed(purpose: PhotoPurpose): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    Alert.alert(
      'Camera access is off',
      `Turn on camera access for MeetNet in Settings to take a photo for your ${purpose}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  }
  const proceed = await new Promise<boolean>((resolve) =>
    Alert.alert(
      'Use the camera?',
      purpose === 'post'
        ? 'MeetNet uses the camera only to take a photo for this post.'
        : 'MeetNet uses the camera only to take your profile photo.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
    ),
  );
  if (!proceed) return false;
  return (await ImagePicker.requestCameraPermissionsAsync()).granted;
}

/** The picked photo, or null when cancelled / refused / not an image. */
export async function pickImage(
  source: 'camera' | 'library',
  purpose: PhotoPurpose,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera' && !(await cameraAllowed(purpose))) return null;
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
  if (!asset) return null;
  if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
    useUiStore.getState().showToast('⚠️ Only image files allowed', 'error');
    return null;
  }
  return asset;
}
