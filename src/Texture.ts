import { MipGenerator } from "./MipGenerator";
import { numMipLevels } from "./Utils";

type TextureOptions = {
  mips?: boolean;
  flipsY?: boolean;
};

export class Texture {
  private constructor(public handle: GPUTexture) {}
  static fromSource(device: GPUDevice, source: ImageBitmap, options: TextureOptions = {}): Texture {
    const mipLevelCount = options.mips ? numMipLevels(source.width, source.height) : 1;

    const textureHandle = device.createTexture({
      format: "rgba8unorm",
      mipLevelCount,
      size: {
        width: source.width,
        height: source.height,
        depthOrArrayLayers: 1,
      },
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUBufferUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const texture = new Texture(textureHandle);

    device.queue.copyExternalImageToTexture(
      { source, flipY: options.flipsY },
      { texture: textureHandle },
      { width: source.width, height: source.height }
    );

    if (textureHandle.mipLevelCount > 1) {
      new MipGenerator(device).generate(textureHandle);
    }

    return texture;
  }
}
