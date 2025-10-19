// import { Result, ok, err, isOk, isErr } from "./result";
import vertShader from "./shaders/vert.wgsl";
import fragShader from "./shaders/frag.wgsl";

export class Renderer {
  protected device!: GPUDevice;
  protected context!: GPUCanvasContext;
  protected presentationFormat!: GPUTextureFormat;
  protected pipeline!: GPURenderPipeline;

  private vertexShader!: GPUShaderModule;
  private fragmentShader!: GPUShaderModule;

  constructor(private canvas: HTMLCanvasElement) {
    if (!canvas) {
      throw new Error("Canvas bos olamaz");
    }
  }

  static async newInstance(canvas: HTMLCanvasElement): Promise<Renderer> {
    const renderer = new Renderer(canvas);
    await renderer.setupGpu();
    return renderer;
  }

  public startRenderLoop() {
    requestAnimationFrame(this.render);
  }

  public async setupGpu() {
    this.device = await this.get_gpu_device();
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context = this.configure_canvas(this.device, this.presentationFormat);

    this.loadShaders();
    this.configurePipeline();
  }

  private async get_gpu_device(): Promise<GPUDevice> {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
      throw new Error("Browser does not support WebGPU");
    }
    return device;
  }

  private configure_canvas(device: GPUDevice, presentationFormat: GPUTextureFormat): GPUCanvasContext {
    const context = this.canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Failed to get canvas context");
    }
    context.configure({
      device,
      format: presentationFormat,
    });
    return context;
  }

  private loadShaders() {
    this.loadVertexShader();
    this.loadFragmentShader();
  }

  protected loadVertexShader() {
    this.vertexShader = this.device.createShaderModule({
      label: "Vertex Shader",
      code: vertShader,
    });
  }

  protected loadFragmentShader() {
    this.fragmentShader = this.device.createShaderModule({
      label: "Fragment Shader",
      code: fragShader,
    });
  }

  protected configurePipeline() {
    this.loadShaders();
    this.pipeline = this.device.createRenderPipeline({
      label: "Render Pipeline",
      layout: "auto",
      vertex: { module: this.vertexShader },
      fragment: {
        module: this.fragmentShader,
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
          clearValue: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
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
