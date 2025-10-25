import "./style.css";
import { WebGPU_ImportingImages_Renderer } from "./WebGPU_ImportingImages.ts";

const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;

const renderer = await WebGPU_ImportingImages_Renderer.newInstance(canvas);
renderer.startRenderLoop();
