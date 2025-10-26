import "./style.css";
import { WebGPU_TexturedCube_Renderer } from "./WebGPU_TexturedCube_Renderer.ts";

const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;

const renderer = await WebGPU_TexturedCube_Renderer.newInstance(canvas);
renderer.startRenderLoop();
