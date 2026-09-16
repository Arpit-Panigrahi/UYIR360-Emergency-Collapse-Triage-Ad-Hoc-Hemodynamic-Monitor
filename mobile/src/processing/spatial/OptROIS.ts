import { OptROISConfig, RawOpticalSample } from '../types';

export class OptROIS {
  constructor(config: Partial<OptROISConfig> = {}) {}

  public reset(): void {}

  public processFramePixels(
    pixels: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    timestamp: number,
    isBGRA: boolean = false
  ): RawOpticalSample {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;

    const step = 2; // Keep subsampling for performance
    for (let y = 0; y < height; y += step) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += step) {
        const pxIdx = rowOffset + x * 4;
        sumR += isBGRA ? pixels[pxIdx + 2] : pixels[pxIdx];
        sumG += pixels[pxIdx + 1];
        sumB += isBGRA ? pixels[pxIdx] : pixels[pxIdx + 2];
        count++;
      }
    }

    return {
      timestamp,
      red: sumR / count,
      green: sumG / count,
      blue: sumB / count,
    };
  }
}
