import "./style.css";
import { WebGPU_LoadingCanvas_Renderer } from "./WebGPU_LoadingCanvas.ts";

const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;

const renderer = await WebGPU_LoadingCanvas_Renderer.newInstance(canvas);
renderer.startRenderLoop();
