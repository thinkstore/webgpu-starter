import { Renderer } from "./Renderer";

import { mat4 } from "wgpu-matrix";
import { Texture } from "./Texture";
import { GUI } from "dat.gui";

class ObjectInfo {
  constructor(
    public bindGroups: GPUBindGroup[],
    public matrix: Float32Array,
    public uniformValues: Float32Array,
    public uniformBuffer: GPUBuffer
  ) {}
}

export class WebGPU_LoadingCanvas_Renderer extends Renderer {
  private bindGroupIndex: number = 0;
  private objectInfos: ObjectInfo[] = [];
  private gui!: GUI;

  settings = {
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
  };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.gui = new GUI();
    // Object.assign(this.gui.domElement.style, { right: "", left: "15px" });

    this.gui.add(this.settings, "addressModeU", ["repeat", "clamp-to-edge"]);
    this.gui.add(this.settings, "addressModeV", ["repeat", "clamp-to-edge"]);
    this.gui.add(this.settings, "magFilter", ["nearest", "linear"]).onChange((value) => {
      console.log(`value :${value}`);
    });
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_LoadingCanvas_Renderer(canvas);
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
            vsOut.position = uni.matrix * vec4f( xy , 0.0 , 1.0 );
            vsOut.texcoord = xy * vec2f(1,50) ;
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

    const textures = await Promise.all([
      await Texture.fromUrl(
        this.device,
        new URL("https://webgpufundamentals.org/webgpu/resources/images/f-texture.png"),
        { mips: true, flipsY: false }
      ),
      await Texture.fromUrl(this.device, new URL("https://webgpufundamentals.org/webgpu/resources/images/coins.jpg"), {
        mips: true,
      }),
      await Texture.fromUrl(
        this.device,
        new URL("https://webgpufundamentals.org/webgpu/resources/images/Granite_paving_tileable_512x512.jpeg"),
        { mips: true }
      ),
    ]);

    this.canvas.addEventListener("click", () => {
      this.bindGroupIndex = (this.bindGroupIndex + 1) % textures.length;
    });

    for (let i = 0; i < 8; i++) {
      const sampler = this.device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        magFilter: i & 1 ? "linear" : "nearest",
        minFilter: i & 2 ? "linear" : "nearest",
        mipmapFilter: i & 4 ? "linear" : "nearest",
      });

      const uniValues = new ArrayBuffer(64);
      const uniViews = {
        matrix: new Float32Array(uniValues),
      };

      const uniformBuffer = this.device.createBuffer({
        label: "uniforms for quad",
        size: uniValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const bindGroups = textures.map((texture) => {
        return this.device.createBindGroup({
          label: `bindgroup for 8. ${i}`,
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: texture.handle.createView() },
            { binding: 2, resource: { buffer: uniformBuffer } },
          ],
        });
      });

      this.objectInfos.push(new ObjectInfo(bindGroups, uniViews.matrix, uniViews.matrix, uniformBuffer));
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
    const viewMatrix = mat4.lookAt(cameraPosition, target, up);
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

    this.objectInfos.forEach((objectInfo, i) => {
      const bindGroup = objectInfo.bindGroups[this.bindGroupIndex];
      const xSpacing = 1.2;
      const ySpacing = 0.7;
      const zDepth = 50;

      const x = (i % 4) - 1.5;
      const y = i < 4 ? 1 : -1;

      mat4.translate(viewProjectionMatrix, [x * xSpacing, y * ySpacing, -zDepth * 0.5], objectInfo.matrix);
      mat4.rotateX(objectInfo.matrix, 0.5 * Math.PI, objectInfo.matrix);
      mat4.scale(objectInfo.matrix, [1, zDepth * 2, 1], objectInfo.matrix);
      mat4.translate(objectInfo.matrix, [-0.5, -0.5, 0], objectInfo.matrix);

      this.device.queue.writeBuffer(objectInfo.uniformBuffer, 0, objectInfo.matrix.buffer);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
    });

    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
