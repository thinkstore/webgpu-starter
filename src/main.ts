import { CellRenderer } from "./CellRenderer.ts";

const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;

const renderer = await CellRenderer.newInstance(canvas);
renderer.startRenderLoop();
