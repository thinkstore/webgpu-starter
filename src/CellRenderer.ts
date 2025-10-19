import { Renderer } from "./Renderer";

export class CellRenderer extends Renderer {
  private vertexBuffer!: GPUBuffer;
  private vertexBufferLayout!: GPUVertexBufferLayout;
  private uniformBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;

  GRID_SIZE = 32;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new CellRenderer(canvas);
    await renderer.init();
    return renderer;
  }

  private createUniformBuffer() {
    // Create a uniform buffer that describes the grid.
    const uniformArray = new Float32Array([this.GRID_SIZE, this.GRID_SIZE]);
    this.uniformBuffer = this.device.createBuffer({
      label: "Grid Uniforms",
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

    this.bindGroup = this.device.createBindGroup({
      label: "Cell renderer bind group",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
      ],
    });
  }

  private createVertexBuffer() {
    // Create a buffer with the vertices for a single cell.
    // prettier-ignore
    const vertices = new Float32Array([
      //   X,    Y
        -0.8, -0.8, // Triangle 1
         0.8, -0.8,
         0.8,  0.8,

        -0.8, -0.8, // Triangle 2
         0.8,  0.8,
        -0.8,  0.8,
      ]);

    this.vertexBuffer = this.device.createBuffer({
      label: "Cell vertices",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);

    this.vertexBufferLayout = {
      arrayStride: 8,
      attributes: [
        {
          format: "float32x2",
          offset: 0,
          shaderLocation: 0, // Position. Matches @location(0) in the @vertex shader.
        },
      ],
    };
  }

  protected override initPipeline(): void {
    this.createVertexBuffer();

    // Create the shader that will render the cells.
    const cellShaderModule = this.device.createShaderModule({
      label: "Cell shader",
      code: `
          @group(0) @binding(0) var<uniform> grid : vec2f;
          @vertex
          fn vertexMain(
            @location(0) position: vec2f , 
            @builtin(instance_index) instance : u32 
          ) -> @builtin(position) vec4f {
            let inst_index = f32(instance);
            let cell = vec2f(inst_index % grid.x, floor(inst_index / grid.x));
            let cellOffset = cell / grid * 2; 

            let gridPos = ( (position + 1) / grid ) - 1 + cellOffset ;
            return vec4f( gridPos , 0, 1);
          }

          @fragment
          fn fragmentMain() -> @location(0) vec4f {
            return vec4f(1, 0, 0, 1);
          }
        `,
    });

    // Create a pipeline that renders the cell.
    this.pipeline = this.device.createRenderPipeline({
      label: "Cell pipeline",
      layout: "auto",
      vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [this.vertexBufferLayout],
      },
      fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
    });

    this.createUniformBuffer();
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
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(6, this.GRID_SIZE * this.GRID_SIZE);
    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
