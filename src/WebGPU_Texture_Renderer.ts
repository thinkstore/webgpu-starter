import { Renderer } from "./Renderer";

export class WebGPU_Texture_Renderer extends Renderer {
  private bindGroup!: GPUBindGroup;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new WebGPU_Texture_Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  protected override initPipeline(): void {
    const module = this.device.createShaderModule({
      label: "triangle shaders with uniforms",
      code: /* wgsl */ `
          struct VSOutput {
            @builtin(position) position: vec4f,
            @location(0) texcoord : vec2f,
          }

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
            vsOut.texcoord = xy;
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

    const kTextureWidth = 5;
    const kTextureHeight = 7;
    const _ = [255, 0, 0, 255]; // red
    const y = [255, 255, 0, 255]; // yellow
    const b = [0, 0, 255, 255]; // blue
    // prettier-ignore
    const textureData = new Uint8Array([
    b, _, _, _, _,
    _, y, y, y, _,
    _, y, _, _, _,
    _, y, y, _, _,
    _, y, _, _, _,
    _, y, _, _, _,
    _, _, _, _, _,
    ].flat());

    const texture = this.device.createTexture({
      label: "yellow F on red",
      size: [kTextureWidth, kTextureHeight],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.device.queue.writeTexture(
      { texture },
      textureData,
      { bytesPerRow: kTextureWidth * 4 },
      { width: kTextureWidth, height: kTextureHeight }
    );

    const sampler = this.device.createSampler();

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture.createView() },
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
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }
}
