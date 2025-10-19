import { Renderer } from "./Renderer";
import { Utils } from "./Utils";

class Assignable {
  [key: string]: any;

  constructor(data: Record<string, any>) {
    Object.assign(this, data);
  }
}

class OurStruct {
  private buffer: ArrayBuffer;
  public color: Float32Array;
  public scale: Float32Array;
  public offset: Float32Array;

  constructor() {
    this.buffer = new ArrayBuffer(32); // toplam 32 byte
    this.color = new Float32Array(this.buffer, 0, 4); // 4 * 4 byte = 16 byte
    this.scale = new Float32Array(this.buffer, 16, 2); // 2 * 4 byte = 8 byte
    this.offset = new Float32Array(this.buffer, 24, 2); // 2 * 4 byte = 8 byte
  }

  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  static byteLength() {
    return 32;
  }

  logValues() {
    console.log("Color:", this.color);
    console.log("Scale:", this.scale);
    console.log("Offset:", this.offset);
  }
}

class ObjectInfo {
  constructor(public uniformValues: OurStruct, public uniformBuffer: GPUBuffer, public bindGroup: GPUBindGroup) {}
}

export class WebGPU_Uniforms_Renderer extends Renderer {
  private objectInfos: ObjectInfo[] = [];
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_Uniforms_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override initPipeline(): void {
    // Create the shader that will render the cells.
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct OurStruct{
            color : vec4f , 
            scale : vec2f , 
            offset : vec2f,
          };

          @group(0) @binding(0) var<uniform> ourStruct : OurStruct;

          @vertex fn vertexMain( @builtin(vertex_index) vertexIndex : u32 ) -> @builtin(position) vec4f {
            let pos = array(
              vec2f( 0.0,  0.5),  // top center
              vec2f(-0.5, -0.5),  // bottom left
              vec2f( 0.5, -0.5)   // bottom right
            );

            return vec4f( pos[vertexIndex] * ourStruct.scale + ourStruct.offset, 0.0, 1.0 );
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
      const uniformValues = new OurStruct();
      uniformValues.color.set([Utils.rand(), Utils.rand(), Utils.rand(), 1]);
      uniformValues.offset.set([Utils.rand(-0.9, 0.9), Utils.rand(-0.9, 0.9)]);
      uniformValues.scale.set([0.4, 0.4]);

      const uniformBuffer = this.device.createBuffer({
        size: OurStruct.byteLength(),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const bindGroup = this.device.createBindGroup({
        label: `bind group for obj: ${i}`,
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      this.objectInfos.push(new ObjectInfo(uniformValues, uniformBuffer, bindGroup));
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
