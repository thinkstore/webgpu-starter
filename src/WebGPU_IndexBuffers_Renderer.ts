import { Circle } from "./Circle";
import { Renderer } from "./Renderer";
import { Utils } from "./Utils";

class ObjectInfo {
  constructor(public scale: number) {}
}

export class WebGPU_IndexBuffers_Renderer extends Renderer {
  private objectInfos: ObjectInfo[] = [];

  private changingStorageValues!: Float32Array;

  private staticVertexBuffer!: GPUBuffer;
  private changingVertexBuffer!: GPUBuffer;

  private kNumObjects = 100;
  private circle!: Circle;
  private vertexBuffer!: GPUBuffer;
  private indexBuffer!: GPUBuffer;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_IndexBuffers_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override async initPipeline() {
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct Vertex {
            @location(0) position: vec2f,
            @location(1) color : vec4f,
            @location(2) offset : vec2f,
            @location(3) scale : vec2f,
            @location(4) perVertexColor : vec4f,
          };

          struct VSOutput {
            @builtin(position) position : vec4f,
            @location(0) color : vec4f,
          }

          @vertex fn vertexMain( vertex : Vertex ) -> VSOutput {

            var vsOut : VSOutput;

            vsOut.position = vec4f( vertex.position * vertex.scale + vertex.offset, 0.0, 1.0 );
            vsOut.color = vertex.color * vertex.perVertexColor ;
            return vsOut;
          }

          @fragment
          fn fragmentMain(vsOut : VSOutput) -> @location(0) vec4f {
            return vsOut.color;
          }
        `,
    });

    const staticInstanceUnitSize = 4 + 2 * 4;
    const changingInstanceUnitSize = 2 * 4;
    this.pipeline = this.device.createRenderPipeline({
      label: "triangle pipeline with uniforms",
      layout: "auto",
      vertex: {
        module: module,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 2 * 4 + 4, // 2 floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
              { shaderLocation: 4, offset: 8, format: "unorm8x4" }, // perVertexColor
            ],
          },
          {
            arrayStride: staticInstanceUnitSize, //color + offset
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, offset: 0, format: "unorm8x4" }, // color
              { shaderLocation: 2, offset: 4, format: "float32x2" }, // offset
            ],
          },
          {
            arrayStride: changingInstanceUnitSize,
            stepMode: "instance",
            attributes: [{ shaderLocation: 3, offset: 0, format: "float32x2" }], //scale
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
    });

    this.staticVertexBuffer = this.device.createBuffer({
      label: "static vertex for objects",
      size: staticInstanceUnitSize * this.kNumObjects,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.changingVertexBuffer = this.device.createBuffer({
      label: "changing vertex for objects",
      size: changingInstanceUnitSize * this.kNumObjects,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.changingStorageValues = new Float32Array(this.changingVertexBuffer.size / 4);

    const staticValuesU8 = new Uint8Array(this.staticVertexBuffer.size);
    const staticValuesF32 = new Float32Array(staticValuesU8.buffer);

    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kOffsetOffset = 1;

    for (let i = 0; i < this.kNumObjects; i++) {
      const staticOffsetU8 = i * staticInstanceUnitSize;
      const staticOffsetF32 = staticOffsetU8 / 4;

      staticValuesU8.set(
        [Utils.rand() * 255, Utils.rand() * 255, Utils.rand() * 255, 255],
        staticOffsetU8 + kColorOffset
      ); //color
      staticValuesF32.set([Utils.rand(-0.9, 0.9), Utils.rand(-0.9, 0.9)], staticOffsetF32 + kOffsetOffset); //offset

      this.objectInfos.push({
        scale: Utils.rand(0.1, 0.6), //scale
      });
    }

    this.device.queue.writeBuffer(this.staticVertexBuffer, 0, staticValuesF32);

    this.circle = new Circle({ radius: 0.5, innerRadius: 0.25 });
    this.vertexBuffer = this.device.createBuffer({
      label: "storage buffer vertices",
      size: this.circle.vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, this.circle.vertexData.buffer);

    this.indexBuffer = this.device.createBuffer({
      label: "Index Buffer",
      size: this.circle.indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    this.device.queue.writeBuffer(this.indexBuffer, 0, this.circle.indexData.buffer);
  }

  protected frame() {
    const command_encoder = this.device.createCommandEncoder();
    const curTextureView = this.context.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      label: "Render Pass Description",
      colorAttachments: [
        {
          view: curTextureView,
          clearValue: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };

    const pass = command_encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.staticVertexBuffer);
    pass.setVertexBuffer(2, this.changingVertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, "uint32");

    const aspect = this.canvas.width / this.canvas.height;

    const kScaleOffset = 0;
    this.objectInfos.forEach((info, i) => {
      const index = (i * this.changingVertexBuffer.size) / this.kNumObjects / 4;
      this.changingStorageValues.set([info.scale / aspect, info.scale], index + kScaleOffset);
    });

    this.device.queue.writeBuffer(this.changingVertexBuffer, 0, this.changingStorageValues.buffer);

    // pass.draw(this.circle.numVertices, this.kNumObjects);
    pass.drawIndexed(this.circle.numVertices, this.kNumObjects);

    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
