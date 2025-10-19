import "./style.css";
// import { CellRenderer } from "./CellRenderer.ts";
// import { Renderer } from "./Renderer.ts";
// import { WebGPU_Uniforms_Renderer } from "./WebGPU_Uniforms_Renderer.ts";
import { WebGPU_StorageBuffers_Renderer } from "./WebGPU_StorageBuffers_Renderer.ts";

const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;

// const renderer = await CellRenderer.newInstance(canvas);
// const renderer = await Renderer.newInstance(canvas);
// const renderer = await WebGPU_Uniforms_Renderer.newInstance(canvas);
const renderer = await WebGPU_StorageBuffers_Renderer.newInstance(canvas);
renderer.startRenderLoop();
