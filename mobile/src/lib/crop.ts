// Crop screen geometry. The photo is shown under a fixed frame (1:1 for the profile photo, 3:1 for
// the cover); the user zooms (≥ 1) and drags, and the photo always covers the whole frame.
// `offset` is how far the photo's centre is from the frame's centre, in screen points.
// Worklets: called from the gesture handlers on the UI thread, and from JS for the final crop.

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type CropRect = { originX: number; originY: number; width: number; height: number };

export const MAX_ZOOM = 4;

/** Profile photo 600×600, cover 1500×500 (JPEG). */
export const PHOTO_OUTPUT = {
  avatar: { width: 600, height: 600 },
  cover: { width: 1500, height: 500 },
} as const;

export type PhotoKind = keyof typeof PHOTO_OUTPUT;

/** Points per image pixel at zoom 1: the smallest scale at which the photo covers the frame. */
export function coverScale(image: Size, frame: Size): number {
  'worklet';
  return Math.max(frame.width / image.width, frame.height / image.height);
}

export function clampZoom(zoom: number): number {
  'worklet';
  return Math.min(MAX_ZOOM, Math.max(1, zoom));
}

/** Keeps the photo over the whole frame at this zoom. */
export function clampOffset(offset: Point, image: Size, frame: Size, zoom: number): Point {
  'worklet';
  const scale = coverScale(image, frame) * zoom;
  const maxX = Math.max(0, (image.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (image.height * scale - frame.height) / 2);
  // `|| 0` turns -0 into 0 (no room to move)
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)) || 0,
    y: Math.min(maxY, Math.max(-maxY, offset.y)) || 0,
  };
}

/** The part of the photo inside the frame, in image pixels (whole pixels, inside the image). */
export function cropRect(image: Size, frame: Size, zoom: number, offset: Point): CropRect {
  'worklet';
  const z = clampZoom(zoom);
  const o = clampOffset(offset, image, frame, z);
  const scale = coverScale(image, frame) * z;
  const width = Math.min(image.width, Math.round(frame.width / scale));
  const height = Math.min(image.height, Math.round(frame.height / scale));
  const left = (image.width * scale - frame.width) / 2 - o.x;
  const top = (image.height * scale - frame.height) / 2 - o.y;
  return {
    originX: Math.min(image.width - width, Math.max(0, Math.round(left / scale))),
    originY: Math.min(image.height - height, Math.max(0, Math.round(top / scale))),
    width,
    height,
  };
}
