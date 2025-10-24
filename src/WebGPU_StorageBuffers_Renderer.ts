import { Circle } from "./Circle";
import { Renderer } from "./Renderer";
import { Utils } from "./Utils";

class StaticParameters {
  private buffer: ArrayBuffer;
  public color: Float32Array;
  public offset: Float32Array;

  constructor() {
    this.buffer = new ArrayBuffer(32); // toplam 32 byte
    this.color = new Float32Array(this.buffer, 0, 4); //offset 0/4 yaparak bulunabilir
    this.offset = new Float32Array(this.buffer, 16, 2); //offset 16/4 yaparak bulunabilir
  }

  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  static get byteLength() {
    return 32;
  }

  static get length() {
    return 32 / 4;
  }

  static get colorOffset() {
    return 0;
  }
  static get offsetOffset() {
    return 4;
  }

  logValues() {
    console.log("Color:", this.color);
    console.log("Offset:", this.offset);
  }
}

class ChangingParameters {
  private buffer: ArrayBuffer;
  public scale: Float32Array;

  constructor() {
    this.buffer = new ArrayBuffer(8);
    this.scale = new Float32Array(this.buffer);
  }

  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  static get byteLength() {
    return 8;
  }

  static get length() {
    return 8 / 4;
  }

  static get scaleOffset() {
    return 0;
  }

  logValues() {
    console.log("Scale:", this.scale);
  }
}

class ObjectInfo {
  constructor(public scale: number) {}
}

export class WebGPU_StorageBuffers_Renderer extends Renderer {
  private objectInfos: ObjectInfo[] = [];
  private bindGroup!: GPUBindGroup;

  private changingStorageBuffer!: GPUBuffer;
  private changingStorageValues!: Float32Array;
  private kNumObjects = 100;
  private circle!: Circle;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_StorageBuffers_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override async initPipeline() {
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct Vertex {
            position: vec2f,
          };

          struct VSOutput {
            @builtin(position) position : vec4f,
            @location(0) color : vec4f,
          }

          struct StaticParameters{
            color : vec4f , 
            offset : vec2f,
          };

          struct ChangingParameters{
            scale : vec2f,
          };

          @group(0) @binding(0) var<storage,read> staticParams : array<StaticParameters>;
          @group(0) @binding(1) var<storage,read> changingParams : array<ChangingParameters>;
          @group(0) @binding(2) var<storage,read> vertices : array<Vertex>;

          @vertex fn vertexMain( @builtin(vertex_index) vertexIndex : u32 , @builtin(instance_index) instanceIndex : u32 ) -> VSOutput {
            let changingParameters = changingParams[instanceIndex];
            let staticParameters = staticParams[instanceIndex];

            var vsOut : VSOutput;

            vsOut.position = vec4f( vertices[vertexIndex].position * changingParameters.scale + staticParameters.offset, 0.0, 1.0 );
            vsOut.color = staticParameters.color;
            return vsOut;
          }

          @fragment
          fn fragmentMain(vsOut : VSOutput) -> @location(0) vec4f {
            return vsOut.color;
          }
        `,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "triangle pipeline with uniforms",
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

    const staticStorageBuffer = this.device.createBuffer({
      label: "static storage for objects",
      size: StaticParameters.byteLength * this.kNumObjects,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.changingStorageBuffer = this.device.createBuffer({
      label: "changing storage for objects",
      size: ChangingParameters.byteLength * this.kNumObjects,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const staticStorageValues = new Float32Array(StaticParameters.length * this.kNumObjects);
    this.changingStorageValues = new Float32Array(ChangingParameters.length * this.kNumObjects);

    for (let i = 0; i < this.kNumObjects; i++) {
      let index = i * StaticParameters.length;

      staticStorageValues.set([Utils.rand(), Utils.rand(), Utils.rand(), 1], index + StaticParameters.colorOffset); //color
      staticStorageValues.set([Utils.rand(-0.9, 0.9), Utils.rand(-0.9, 0.9)], index + StaticParameters.offsetOffset); //offset

      this.objectInfos.push({
        scale: Utils.rand(0.1, 0.6), //scale
      });
    }

    this.device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);

    this.circle = new Circle({ radius: 0.5, innerRadius: 0.25 });
    const vertexStoragBuffer = this.device.createBuffer({
      label: "storage buffer vertices",
      size: this.circle.vertexData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(vertexStoragBuffer, 0, this.circle.vertexData.buffer);

    this.bindGroup = this.device.createBindGroup({
      label: "bind group for objects",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: staticStorageBuffer } },
        { binding: 1, resource: { buffer: this.changingStorageBuffer } },
        { binding: 2, resource: { buffer: vertexStoragBuffer } },
      ],
    });
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

    const aspect = this.canvas.width / this.canvas.height;

    this.objectInfos.forEach((info, i) => {
      const index = i * ChangingParameters.length;
      this.changingStorageValues.set([info.scale / aspect, info.scale], index + ChangingParameters.scaleOffset);
    });

    this.device.queue.writeBuffer(this.changingStorageBuffer, 0, this.changingStorageValues.buffer);

    pass.setBindGroup(0, this.bindGroup);
    pass.draw(this.circle.numVertices, this.kNumObjects);

    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
