import { Renderer } from "./Renderer";
import { Pane } from "tweakpane";
import {
  convertImageDataToMipLevels,
  createBlendedMipmap,
  createCheckedMipmap,
  loadImageBitmap,
  numMipLevels,
  type MipLevel,
} from "./Utils";
import { mat4 } from "wgpu-matrix";

class ObjectInfo {
  constructor(
    public bindGroups: GPUBindGroup[],
    public matrix: Float32Array,
    public uniformValues: Float32Array,
    public uniformBuffer: GPUBuffer
  ) {}
}

export class WebGPU_LoadingImages_Renderer extends Renderer {
  private pane!: Pane;
  private bindGroups: GPUBindGroup[] = [];
  private bindGroupIndex: number = 0;

  settings = {
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
  };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.pane = new Pane();
    this.pane.element.parentElement?.classList.add("tweakpane-top-left");

    this.pane.addBinding(this.settings, "addressModeU", {
      options: { repeat: "repeat", "clamp-to-edge": "clamp-to-edge" },
    });
    this.pane.addBinding(this.settings, "addressModeV", {
      options: { repeat: "repeat", "clamp-to-edge": "clamp-to-edge" },
    });
    this.pane.addBinding(this.settings, "magFilter", { options: { nearest: "nearest", linear: "linear" } });

    this.pane.on("change", () => {
      // Örneğin: WebGPU sampler'ı yeniden oluştur

      this.bindGroupIndex =
        (this.settings.addressModeU === "repeat" ? 1 : 0) +
        (this.settings.addressModeV === "repeat" ? 2 : 0) +
        (this.settings.magFilter === "linear" ? 4 : 0);
      console.log("Güncellenen ayar:", this.bindGroupIndex);
    });
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_LoadingImages_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override async initPipeline() {
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct VSOutput {
            @builtin(position) position: vec4f,
            @location(0) texcoord : vec2f,
          }

          struct Uniforms{
            matrix : mat4x4f,
          }

          @group(0) @binding(2) var<uniform> uni : Uniforms;

          @vertex fn vertexMain( @builtin(vertex_index) vertexIndex : u32 ) -> VSOutput {

            let pos = array(
              // 1st triangle
              vec2f( 0.0,  0.0),  // center
              vec2f( 1.0,  0.0),  // right, center
              vec2f( 0.0,  1.0),  // center, top
          
              // 2nd triangle
              vec2f( 0.0,  1.0),  // center, top
              vec2f( 1.0,  0.0),  // right, center
              vec2f( 1.0,  1.0),  // right, top
            );


            var vsOut : VSOutput;

            let xy = pos[vertexIndex];
            vsOut.position = vec4f( xy , 0.0 , 1.0 );
            vsOut.texcoord = xy ;
            return vsOut;
          }

          @group(0) @binding(0) var ourSampler : sampler ;
          @group(0) @binding(1) var ourTexture : texture_2d<f32>;


          @fragment
          fn fragmentMain(vsOut : VSOutput) -> @location(0) vec4f {
            return textureSample( ourTexture , ourSampler , vsOut.texcoord);
          }
        `,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "hardcoded texture quad pipeline",
      layout: "auto",
      vertex: {
        module: module,
        entryPoint: "vertexMain",
      },
      fragment: {
        module: module,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
    });

    const url: URL = new URL("/resources/images/f-texture.png", import.meta.url);
    const source = await loadImageBitmap(url);
    const texture = this.device.createTexture({
      label: url.toString(),
      format: "rgba8unorm",
      mipLevelCount: numMipLevels(source.width, source.height),
      size: [source.width, source.height],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source, flipY: true },
      { texture },
      { width: source.width, height: source.height }
    );

    for (let i = 0; i < 8; i++) {
      const sampler = this.device.createSampler({
        addressModeU: i & 1 ? "repeat" : "clamp-to-edge",
        addressModeV: i & 2 ? "repeat" : "clamp-to-edge",
        magFilter: i & 4 ? "linear" : "nearest",
      });

      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: texture.createView() },
        ],
      });
      this.bindGroups.push(bindGroup);
    }
  }

  protected frame() {
    const bindGroup = this.bindGroups[this.bindGroupIndex];

    const command_encoder = this.device.createCommandEncoder();
    const curTextureView = this.context.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      label: "Render Pass Description",
      colorAttachments: [
        {
          view: curTextureView,
          clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1.0 },

          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };

    const pass = command_encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
