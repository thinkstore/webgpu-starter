import { Renderer } from "./Renderer";

class Assignable {
  [key: string]: any;

  constructor(data: Record<string, any>) {
    Object.assign(this, data);
  }
}

class OurStruct /*extends Assignable*/ {
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

export class WebGPU_Uniforms_Renderer extends Renderer {
  private bindGroup!: GPUBindGroup;
  private ourStruct!: OurStruct;
  private uniformBuffer!: GPUBuffer;

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

    this.ourStruct = new OurStruct();
    this.ourStruct.color.set([0, 1, 0, 1]);
    this.ourStruct.offset.set([-0.5, 0.0]);

    this.uniformBuffer = this.device.createBuffer({
      size: OurStruct.byteLength(),
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  protected frame() {
    const aspect = this.canvas.width / this.canvas.height;
    this.ourStruct.scale.set([2 / aspect, 1.5]);

    // copy the values from JavaScript to the GPU
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.ourStruct.getBuffer());

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
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
