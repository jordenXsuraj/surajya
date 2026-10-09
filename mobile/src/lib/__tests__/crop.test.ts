import { clampOffset, clampZoom, coverScale, cropRect, MAX_ZOOM } from '@/lib/crop';

const landscape = { width: 4000, height: 3000 };
const square = { width: 300, height: 300 };
const coverFrame = { width: 330, height: 110 };

describe('coverScale', () => {
  it('is the smallest scale at which the photo covers the frame', () => {
    expect(coverScale(landscape, square)).toBeCloseTo(0.1); // 3000 px tall → 300 pt
    expect(coverScale(landscape, coverFrame)).toBeCloseTo(330 / 4000);
  });
});

describe('clampZoom / clampOffset', () => {
  it('keeps zoom between 1 and the maximum', () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it('never lets the photo uncover the frame', () => {
    // 4000×3000 at 0.1 = 400×300 pt over a 300×300 frame: 50 pt of play sideways, none up/down
    expect(clampOffset({ x: 500, y: 40 }, landscape, square, 1)).toEqual({ x: 50, y: 0 });
    expect(clampOffset({ x: -500, y: -40 }, landscape, square, 1)).toEqual({ x: -50, y: 0 });
    // zoom 2: 800×600 → 250 / 150
    expect(clampOffset({ x: 1000, y: 1000 }, landscape, square, 2)).toEqual({ x: 250, y: 150 });
  });
});

describe('cropRect', () => {
  it('without moving: the centred square of the photo', () => {
    expect(cropRect(landscape, square, 1, { x: 0, y: 0 })).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('dragging the photo right shows (and crops) more of its left side', () => {
    expect(cropRect(landscape, square, 1, { x: 50, y: 0 })).toEqual({
      originX: 0,
      originY: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('zooming in crops a smaller part, around the same centre', () => {
    expect(cropRect(landscape, square, 2, { x: 0, y: 0 })).toEqual({
      originX: 1250,
      originY: 750,
      width: 1500,
      height: 1500,
    });
  });

  it('cover: a 3:1 strip across the full width', () => {
    const rect = cropRect(landscape, coverFrame, 1, { x: 0, y: 0 });
    expect(rect.width).toBe(4000);
    expect(rect.height).toBe(1333);
    expect(rect.originX).toBe(0);
    expect(rect.originY).toBe(833); // (3000 - 1333.3) / 2 rounded
  });

  it('always stays inside the photo, whatever the offset or zoom', () => {
    for (const zoom of [0.5, 1, 1.7, 3, 10]) {
      for (const x of [-9999, -40, 0, 40, 9999]) {
        for (const y of [-9999, 0, 9999]) {
          const r = cropRect(landscape, coverFrame, zoom, { x, y });
          expect(r.originX).toBeGreaterThanOrEqual(0);
          expect(r.originY).toBeGreaterThanOrEqual(0);
          expect(r.originX + r.width).toBeLessThanOrEqual(landscape.width);
          expect(r.originY + r.height).toBeLessThanOrEqual(landscape.height);
          expect(r.width / r.height).toBeCloseTo(3, 1);
        }
      }
    }
  });
});
