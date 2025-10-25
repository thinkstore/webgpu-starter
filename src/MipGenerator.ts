export class MipGenerator {
  private module: GPUShaderModule | null = null;
  private sampler: GPUSampler | null = null;
  private pipelineCache: Map<GPUTextureFormat, GPURenderPipeline> = new Map();

  constructor(private device: GPUDevice) {}

  private initShaderModule() {
    if (this.module) return;

    this.module = this.device.createShaderModule({
      label: "MinGen Shader",

      code: /* wgsl */ `
        struct VSOutput{
          @builtin(position) : vec4f , 
          @location(0) : texcoord : vec2f,
        };

        @vertex fn vs(
          @builtin(vertex_index) vertexIndex : u32 
        ) -> VSOutput {

          let pos = array(

              vec2f( 0.0,  0.0),  // center
              vec2f( 1.0,  0.0),  // right, center
              vec2f( 0.0,  1.0),  // center, top

                // 2st triangle
              vec2f( 0.0,  1.0),  // center, top
              vec2f( 1.0,  0.0),  // right, center
              vec2f( 1.0,  1.0),  // right, top
          );

          var vsOut = VSOutput;
          let xy = pos[vertexIndex];
          vsOut.position = vec4f(xy * 2.0 - 1.0 , 0.0 , 1.0 );
          vsOut.texcoord = vec2f( xy.x , 1.0 - xy.y);
          return vsOut;
        }

        @group(0) @binding(0) var mSampler = sampler;
        @group(0) @binding(1) var mTexture = texture_2d<f32>;

        @fragment fn fs(
          input : VSOutput 
        ) -> @location(0) vec4f  
        {
          return textureSample( mTexture , mSampler , input.texcoord );
        }
      `,
    });

    this.sampler = this.device.createSampler({ minFilter: "linear" });
  }

  private getPipeline(format: GPUTextureFormat): GPURenderPipeline {
    if (this.pipelineCache.has(format)) {
      return this.pipelineCache.get(format)!;
    }

    const pipeline = this.device.createRenderPipeline({
      label: `Mipgen pipeline (${format})`,
      layout: "auto",
      vertex: { module: this.module!, entryPoint: "vs" },
      fragment: {
        module: this.module!,
        entryPoint: "fs",
        targets: [{ format }],
      },
    });

    this.pipelineCache.set(format, pipeline);
    return pipeline;
  }

  public generate(texture: GPUTexture) {
    this.initShaderModule();
    const pipeline = this.getPipeline(texture.format);
    const encoder = this.device.createCommandEncoder({ label: "MipGen Encoder" });

    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler! },
          {
            binding: 1,
            resource: texture.createView({
              baseMipLevel: level - 1,
              mipLevelCount: 1,
            }),
          },
        ],
      });

      const pass = encoder.beginRenderPass({
        label: `Render Mip Level ${level}`,
        colorAttachments: [
          {
            view: texture.createView({
              baseMipLevel: level,
              mipLevelCount: 1,
            }),
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6), pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }
}
