import { Renderer } from "./Renderer";
import { Utils } from "./Utils";

class StaticParameters {
  private buffer: ArrayBuffer;
  public color: Float32Array;
  public offset: Float32Array;

  constructor() {
    this.buffer = new ArrayBuffer(32); // toplam 32 byte
    this.color = new Float32Array(this.buffer, 0, 4);
    this.offset = new Float32Array(this.buffer, 16, 2);
  }

  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  static byteLength() {
    return 32;
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

  static byteLength() {
    return 8;
  }

  logValues() {
    console.log("Scale:", this.scale);
  }
}

class ObjectInfo {
  constructor(
    public uniformValues: ChangingParameters,
    public uniformBuffer: GPUBuffer,
    public bindGroup: GPUBindGroup
  ) {}
}

export class WebGPU_StorageBuffers_Renderer extends Renderer {
  private objectInfos: ObjectInfo[] = [];
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_StorageBuffers_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override initPipeline(): void {
    // Create the shader that will render the cells.
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct StaticParameters{
            color : vec4f , 
            offset : vec2f,
          };

          struct ChangingParameters{
            scale : vec2f,
          };

          @group(0) @binding(0) var<storage,read> ourStruct : StaticParameters;
          @group(0) @binding(1) var<storage,read> otherStruct : ChangingParameters;

          @vertex fn vertexMain( @builtin(vertex_index) vertexIndex : u32 ) -> @builtin(position) vec4f {
            let pos = array(
              vec2f( 0.0,  0.5),  // top center
              vec2f(-0.5, -0.5),  // bottom left
              vec2f( 0.5, -0.5)   // bottom right
            );
            return vec4f( pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0 );
          }

          @fragment
          fn fragmentMain() -> @location(0) vec4f {
            return ourStruct.color;
          }
        `,
    });

    // Create a pipeline that renders the cell.
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

    const kNumObjects = 100;

    for (let i = 0; i < kNumObjects; i++) {
      const staticUniformBuffer = this.device.createBuffer({
        label: `static uniform for obj: ${i}`,
        size: StaticParameters.byteLength(),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      {
        const staticUniformValues = new StaticParameters();
        staticUniformValues.color.set([Utils.rand(), Utils.rand(), Utils.rand(), 1]);
        staticUniformValues.offset.set([Utils.rand(-0.9, 0.9), Utils.rand(-0.9, 0.9)]);

        this.device.queue.writeBuffer(staticUniformBuffer, 0, staticUniformValues.getBuffer());
      }

      const changingUniformValues = new ChangingParameters();

      const changingUniformBuffer = this.device.createBuffer({
        label: `changing uniform for obj: ${i}`,
        size: ChangingParameters.byteLength(),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      const bindGroup = this.device.createBindGroup({
        label: `bind group for obj: ${i}`,
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: staticUniformBuffer } },
          { binding: 1, resource: { buffer: changingUniformBuffer } },
        ],
      });

      this.objectInfos.push(new ObjectInfo(changingUniformValues, changingUniformBuffer, bindGroup));
    }
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

    for (const object of this.objectInfos) {
      object.uniformValues.scale.set([0.4 / aspect, 0.4]);
      this.device.queue.writeBuffer(object.uniformBuffer, 0, object.uniformValues.getBuffer());
      pass.setBindGroup(0, object.bindGroup);
      pass.draw(3);
    }

    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
