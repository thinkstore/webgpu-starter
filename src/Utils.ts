export type MipLevel = {
  data: Uint8Array;
  width: number;
  height: number;
};

export class Utils {
  static rand(min?: number, max?: number): number {
    if (min === undefined) {
      min = 0;
      max = 1;
    } else if (max === undefined) {
      max = min;
      min = 0;
    }
    return min + Math.random() * (max - min);
  }
}

export const createBlendedMipmap = () => {
  const w = [255, 255, 255, 255];
  const r = [255, 0, 0, 255];
  const b = [0, 28, 116, 255];
  const y = [255, 231, 0, 255];
  const g = [58, 181, 75, 255];
  const a = [38, 123, 167, 255];

  // prettier-ignore
  const data = new Uint8Array([
      w, r, r, r, r, r, r, a, a, r, r, r, r, r, r, w,
      w, w, r, r, r, r, r, a, a, r, r, r, r, r, w, w,
      w, w, w, r, r, r, r, a, a, r, r, r, r, w, w, w,
      w, w, w, w, r, r, r, a, a, r, r, r, w, w, w, w,
      w, w, w, w, w, r, r, a, a, r, r, w, w, w, w, w,
      w, w, w, w, w, w, r, a, a, r, w, w, w, w, w, w,
      w, w, w, w, w, w, w, a, a, w, w, w, w, w, w, w,
      b, b, b, b, b, b, b, b, a, y, y, y, y, y, y, y,
      b, b, b, b, b, b, b, g, y, y, y, y, y, y, y, y,
      w, w, w, w, w, w, w, g, g, w, w, w, w, w, w, w,
      w, w, w, w, w, w, r, g, g, r, w, w, w, w, w, w,
      w, w, w, w, w, r, r, g, g, r, r, w, w, w, w, w,
      w, w, w, w, r, r, r, g, g, r, r, r, w, w, w, w,
      w, w, w, r, r, r, r, g, g, r, r, r, r, w, w, w,
      w, w, r, r, r, r, r, g, g, r, r, r, r, r, w, w,
      w, r, r, r, r, r, r, g, g, r, r, r, r, r, r, w,
    ].flat());
  return generateMips(data, 16);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mix = (a: Uint8Array, b: Uint8Array, t: number): Uint8Array => a.map((v, i) => lerp(v, b[i], t));

export const bilinearFilter = (
  tl: Uint8Array,
  tr: Uint8Array,
  bl: Uint8Array,
  br: Uint8Array,
  t1: number,
  t2: number
): Uint8Array => {
  const t = mix(tl, tr, t1);
  const b = mix(bl, br, t1);
  return mix(t, b, t2);
};

export const createNextMipLevelRgba8Unorm = ({ data: src, width: srcWidth, height: srcHeight }: MipLevel): MipLevel => {
  const dstWidth = Math.max(1, Math.floor(srcWidth / 2));
  const dstHeight = Math.max(1, Math.floor(srcHeight / 2));
  const dst = new Uint8Array(dstWidth * dstHeight * 4);

  const getSrcPixel = (x: number, y: number): Uint8Array => {
    const offset = (y * srcWidth + x) * 4;
    return src.subarray(offset, offset + 4);
  };

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const u = (x + 0.5) / dstWidth;
      const v = (y + 0.5) / dstHeight;

      const au = u * srcWidth - 0.5;
      const av = v * srcHeight - 0.5;

      const tx = Math.floor(au);
      const ty = Math.floor(av);

      const t1 = au % 1;
      const t2 = av % 1;

      const tl = getSrcPixel(tx, ty);
      const tr = getSrcPixel(tx + 1, ty);
      const bl = getSrcPixel(tx, ty + 1);
      const br = getSrcPixel(tx + 1, ty + 1);

      const dstOffset = (y * dstWidth + x) * 4;
      dst.set(bilinearFilter(tl, tr, bl, br, t1, t2), dstOffset);
    }
  }

  return { data: dst, width: dstWidth, height: dstHeight };
};

export const generateMips = (src: Uint8Array, srcWidth: number): MipLevel[] => {
  const srcHeight = src.length / 4 / srcWidth;
  let mip: MipLevel = {
    data: src,
    width: srcWidth,
    height: srcHeight,
  };

  const mips: MipLevel[] = [mip];

  while (mip.width > 1 || mip.height > 1) {
    mip = createNextMipLevelRgba8Unorm(mip);
    mips.push(mip);
  }

  return mips;
};

export function createCheckedMipmap(): ImageData[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context not available");

  const levels = [
    { size: 64, color: "rgb(128,0,255)" },
    { size: 32, color: "rgb(0,255,0)" },
    { size: 16, color: "rgb(255,0,0)" },
    { size: 8, color: "rgb(255,255,0)" },
    { size: 4, color: "rgb(0,0,255)" },
    { size: 2, color: "rgb(0,255,255)" },
    { size: 1, color: "rgb(255,0,255)" },
  ];

  return levels.map(({ size, color }, i) => {
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = i % 2 === 1 ? "#000" : "#fff";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

    return ctx.getImageData(0, 0, size, size);
  });
}

export function convertImageDataToMipLevels(images: ImageData[]): MipLevel[] {
  return images.map(
    (img): MipLevel => ({
      data: new Uint8Array(img.data.buffer),
      width: img.width,
      height: img.height,
    })
  );
}

export async function loadImageBitmap(url: URL): Promise<ImageBitmap> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await createImageBitmap(blob, { colorSpaceConversion: "none" });
}

/**
 * TextureUtils.ts
 * Yardımcı fonksiyonlar: mipmap hesaplama, boyut analizi, texture ergonomisi
 */

/**
 * Belirtilen boyutlara göre mipmap seviyesi hesaplar.
 * Örnek: numMipLevels(512, 256) → 10
 */
export function numMipLevels(...sizes: number[]): number {
  const maxSize = Math.max(...sizes);
  return (1 + Math.log2(maxSize)) | 0;
}

/**
 * Texture boyutunun power-of-two olup olmadığını kontrol eder.
 */
export function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0 && value !== 0;
}

/**
 * Texture boyutlarını normalize eder (örneğin negatif veya sıfır değerleri engeller).
 */
export function sanitizeTextureSize(width: number, height: number): [number, number] {
  return [Math.max(1, width), Math.max(1, height)];
}

/**
 * Texture için önerilen mipmap seviyesi aralığını döndürür.
 */
export function mipRange(width: number, height: number): number[] {
  const levels = numMipLevels(width, height);
  return Array.from({ length: levels }, (_, i) => i);
}
