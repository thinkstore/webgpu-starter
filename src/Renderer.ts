// import { Result, ok, err, isOk, isErr } from "./result";
import vertShader from "./shaders/vert.wgsl";
import fragShader from "./shaders/frag.wgsl";

export class Renderer {
  protected device!: GPUDevice;
  protected context!: GPUCanvasContext;
  protected presentationFormat!: GPUTextureFormat;
  protected pipeline!: GPURenderPipeline;

  constructor(protected canvas: HTMLCanvasElement) {
    if (!canvas) {
      throw new Error("Canvas bos olamaz");
    }
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new Renderer(canvas);
    await renderer.init();
    return renderer;
  }

  public startRenderLoop() {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // const canvas = entry.target;
        const width = entry.contentBoxSize[0].inlineSize;
        const height = entry.contentBoxSize[0].blockSize;
        this.canvas.width = Math.max(1, Math.min(width, this.device.limits.maxTextureDimension2D));
        this.canvas.height = Math.max(1, Math.min(height, this.device.limits.maxTextureDimension2D));
        // re-render
        this.render();
      }
    });
    observer.observe(this.canvas);
  }

  public async init() {
    await this.initDevice();
    this.initCanvas(this.device);
    this.initPipeline();
  }

  private async initDevice() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
      throw new Error("Browser does not support WebGPU");
    }
    this.device = device;
  }

  private initCanvas(device: GPUDevice) {
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    const context = this.canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Failed to get canvas context");
    }
    context.configure({
      device,
      format: this.presentationFormat,
    });
    this.context = context;
  }

  protected initPipeline() {
    const vs = this.device.createShaderModule({
      label: "Vertex Shader",
      code: vertShader,
    });
    const fs = this.device.createShaderModule({
      label: "Fragment Shader",
      code: fragShader,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "Render Pipeline",
      layout: "auto",
      vertex: {
        entryPoint: "vs",
        module: vs,
      },
      fragment: {
        entryPoint: "fs",
        module: fs,
        targets: [{ format: this.presentationFormat }],
      },
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
          clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };

    const pass = command_encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(this.pipeline);
    pass.draw(6);
    pass.end();

    this.device.queue.submit([command_encoder.finish()]);
  }

  protected render = () => {
    this.frame();
    requestAnimationFrame(this.render);
  };
}
