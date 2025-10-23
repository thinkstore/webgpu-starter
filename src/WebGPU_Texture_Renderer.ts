import { Renderer } from "./Renderer";
import { Pane } from "tweakpane";
import { convertImageDataToMipLevels, createBlendedMipmap, createCheckedMipmap, type MipLevel } from "./Utils";
import { mat4 } from "wgpu-matrix";

class ObjectInfo {
  constructor(
    public bindGroups: GPUBindGroup[],
    public matrix: Float32Array,
    public uniformValues: Float32Array,
    public uniformBuffer: GPUBuffer
  ) {}
}

export class WebGPU_Texture_Renderer extends Renderer {
  private pane!: Pane;
  private textures: GPUTexture[] = [];
  private objectInfos: ObjectInfo[] = [];

  settings = {
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    texture: "first",
  };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.pane = new Pane();

    this.pane.addBinding(this.settings, "addressModeU", {
      options: { repeat: "repeat", "clamp-to-edge": "clamp-to-edge" },
    });
    this.pane.addBinding(this.settings, "addressModeV", {
      options: { repeat: "repeat", "clamp-to-edge": "clamp-to-edge" },
    });
    this.pane.addBinding(this.settings, "magFilter", { options: { nearest: "nearest", linear: "linear" } });
    this.pane.addBinding(this.settings, "texture", { options: { first: "first", second: "second" } });

    this.pane.on("change", () => {
      console.log("Güncellenen ayar:", this.settings);
      // Örneğin: WebGPU sampler'ı yeniden oluştur
    });
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_Texture_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  private createTextureWithMips(mips: MipLevel[], label: string): GPUTexture {
    const texture = this.device.createTexture({
      label,
      size: {
        width: mips[0].width,
        height: mips[0].height,
        depthOrArrayLayers: 1,
      },
      mipLevelCount: mips.length,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    mips.forEach(({ data, width, height }, mipLevel) => {
      this.device.queue.writeTexture(
        { texture, mipLevel },
        data.buffer,
        { bytesPerRow: width * 4 },
        { width: width, height: height }
      );
    });

    return texture;
  }

  protected override initPipeline(): void {
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
            vsOut.position = uni.matrix * vec4f( xy , 0.0 , 1.0 );
            vsOut.texcoord = xy * vec2f(1,50);
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

    this.textures = [
      this.createTextureWithMips(createBlendedMipmap(), "blended"),
      this.createTextureWithMips(convertImageDataToMipLevels(createCheckedMipmap()), "checked"),
    ];

    for (let i = 0; i < 8; i++) {
      const sampler = this.device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        magFilter: i & 1 ? "linear" : "nearest",
        minFilter: i & 2 ? "linear" : "nearest",
        mipmapFilter: i & 4 ? "linear" : "nearest",
      });

      // create a buffer for the uniform values
      const uniformBufferSize = 64;
      const uniformBuffer = this.device.createBuffer({
        label: "uniforms for quad",
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const uniformValues = new Float32Array(uniformBufferSize / 4);
      const matrix = uniformValues.subarray(0, 16);

      const bindGroups = this.textures.map((texture) => {
        return this.device.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: texture.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } },
          ],
        });
      });

      this.objectInfos.push(new ObjectInfo(bindGroups, matrix, uniformValues, uniformBuffer));
    }
  }

  protected frame() {
    const fov = (60 * Math.PI) / 180; // 60 degrees in radians
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const zNear = 1;
    const zFar = 2000;
    const projectionMatrix = mat4.perspective(fov, aspect, zNear, zFar);

    const cameraPosition = [0, 0, 2];
    const up = [0, 1, 0];
    const target = [0, 0, 0];
    const cameraMatrix = mat4.lookAt(cameraPosition, target, up);
    const viewMatrix = mat4.inverse(cameraMatrix);
    const viewProjectionMatrix = mat4.multiply(projectionMatrix, viewMatrix);

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

    this.objectInfos.forEach(({ bindGroups, matrix, uniformBuffer, uniformValues }, i) => {
      const bindGroup = bindGroups[this.settings.texture == "first" ? 0 : 1];

      const xSpacing = 1.2;
      const ySpacing = 0.7;
      const zDepth = 50;

      const x = (i % 4) - 1.5;
      const y = i < 4 ? 1 : -1;

      mat4.translate(viewProjectionMatrix, [x * xSpacing, y * ySpacing, -zDepth * 0.5], matrix);
      mat4.rotateX(matrix, 0.5 * Math.PI, matrix);
      mat4.scale(matrix, [1, zDepth * 2, 1], matrix);
      mat4.translate(matrix, [-0.5, -0.5, 0], matrix);

      // copy the values from JavaScript to the GPU
      this.device.queue.writeBuffer(uniformBuffer, 0, uniformValues.buffer);

      pass.setBindGroup(0, bindGroup);
      pass.draw(6); // call our vertex shader 6 times
    });

    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
