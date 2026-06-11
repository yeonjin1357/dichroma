import { simulateImageData, type CvdType } from '@dichroma/core';

/** The subset of ImageData the simulator needs — keeps tests canvas-free. */
export interface ImageDataLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Simulate an RGBA buffer without mutating it: copies the pixels, runs
 * @dichroma/core's in-place simulateImageData on the copy, and returns the
 * copy (alpha untouched). The caller wraps it back into an ImageData for
 * putImageData.
 */
export function simulateImageDataCopy(
  image: ImageDataLike,
  type: CvdType,
  severity: number,
): Uint8ClampedArray<ArrayBuffer> {
  // Allocate by length (not by copy-constructor) so TS knows the backing
  // store is a plain ArrayBuffer — the ImageData constructor requires it.
  const copy = new Uint8ClampedArray(image.data.length);
  copy.set(image.data);
  simulateImageData(copy, type, severity);
  return copy;
}
