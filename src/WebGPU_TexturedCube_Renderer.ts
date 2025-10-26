import { Renderer } from "./Renderer";

import { mat4 } from "wgpu-matrix";
import { Texture } from "./Texture";
import { GUI } from "dat.gui";
import { Cube } from "./Cube";

const degToRad = (d: number) => (d * Math.PI) / 180;
const radToDeg = (rad: number) => rad * (180 / Math.PI);
const radToDegOptions = { min: -360, max: 360, step: 1, converters: radToDeg };

export class WebGPU_TexturedCube_Renderer extends Renderer {
  private gui!: GUI;
  private depthTexture!: GPUTexture;
  private uniformBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private uniValues!: ArrayBuffer;
  private numVertices: number = 0;
  private vertexBuffer!: GPUBuffer;
  private indexBuffer!: GPUBuffer;

  settings = {
    rotationX: 20,
    rotationY: 25,
    rotationZ: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.gui = new GUI();
    this.gui.add(this.settings, "rotationX", -360, 360).step(1);
    this.gui.add(this.settings, "rotationY", -360, 360).step(1);
    this.gui.add(this.settings, "rotationZ", -360, 360).step(1);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_TexturedCube_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override async initPipeline() {
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct Uniforms{
            matrix : mat4x4f,
          }

          struct Vertex {
            @location(0) position : vec4f,
            @location(1) texcoord : vec2f,
          }

          struct VSOutput {
            @builtin(position) position: vec4f,
            @location(0) texcoord : vec2f,
          }

          @group(0) @binding(0) var<uniform> uni : Uniforms;
          @vertex fn vertexMain(vertex : Vertex) -> VSOutput {
            var vsOut : VSOutput;

            vsOut.position = uni.matrix * vertex.position;
            vsOut.texcoord = vertex.texcoord;
            return vsOut;
          }

          


          @group(0) @binding(1) var ourSampler : sampler ;
          @group(0) @binding(2) var ourTexture : texture_2d<f32>;
          @fragment
          fn fragmentMain(vsOut : VSOutput) -> @location(0) vec4f {
            return textureSample( ourTexture , ourSampler , vsOut.texcoord);
          }
        `,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "2 attritbutes",
      layout: "auto",
      vertex: {
        module: module,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 5 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" }, //position
              { shaderLocation: 1, offset: 12, format: "float32x2" }, //texcoord
            ],
          },
        ],
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
      primitive: {
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    const cube = new Cube();
    const { vertexData, indexData, numVertices } = cube;
    this.numVertices = numVertices;

    this.vertexBuffer = this.device.createBuffer({
      label: "vertex buffer",
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData.buffer);

    this.indexBuffer = this.device.createBuffer({
      label: "index buffer",
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, indexData.buffer);

    const texture = await Texture.fromUrl(this.device, new URL("/resources/images/noodles.jpg", import.meta.url), {
      mips: true,
      flipsY: false,
    });

    const sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });

    this.uniValues = new ArrayBuffer(64);
    const matrixValue = new Float32Array(this.uniValues);

    this.uniformBuffer = this.device.createBuffer({
      label: "uniform buffer",
      size: matrixValue.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = this.device.createBindGroup({
      label: `bindgroup for object`,
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.handle.createView() },
      ],
    });

    const canvastexture = this.context.getCurrentTexture();
    this.depthTexture = this.device.createTexture({
      size: [canvastexture.width, canvastexture.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  protected frame() {
    const matrix = new Float32Array(this.uniValues);

    const fov = (60 * Math.PI) / 180; // 60 degrees in radians
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 10;
    mat4.perspective(fov, aspect, zNear, zFar, matrix);

    const cameraPosition = [0, 1, 8];
    const target = [0, 0, 0];
    const up = [0, 1, 0];
    const viewMatrix = mat4.lookAt(cameraPosition, target, up);
    mat4.multiply(matrix, viewMatrix, matrix);

    mat4.rotateX(matrix, degToRad(this.settings.rotationX), matrix);
    mat4.rotateY(matrix, degToRad(this.settings.rotationY), matrix);
    mat4.rotateZ(matrix, degToRad(this.settings.rotationZ), matrix);

    const command_encoder = this.device.createCommandEncoder();
    const canvasTexture = this.context.getCurrentTexture();
    const curTextureView = canvasTexture.createView();

    // prettier-ignore
    if ( !this.depthTexture  ||  this.depthTexture.width !== canvasTexture.width || this.depthTexture.height !== canvasTexture.height  ){
      if( this.depthTexture )
        this.depthTexture.destroy();

      this.depthTexture = this.device.createTexture({
        size: [canvasTexture.width, canvasTexture.height],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

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
      depthStencilAttachment: {
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
        view: this.depthTexture.createView(),
      },
    };

    const pass = command_encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, "uint16");

    this.device.queue.writeBuffer(this.uniformBuffer, 0, matrix);
    pass.setBindGroup(0, this.bindGroup);
    pass.drawIndexed(this.numVertices);

    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
