import {draw} from './draw.js';
import {setupInputs} from './inputs.js';

const canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const state = {
  //for zooming
  baseZoom: 400,
  zoom: 300,

  //color variables
  hueBase: 0,
  hueSpeed: 10,

  //declare (0,0) for the fractal's canvas
  offsetX: -canvas.width / 2,
  offsetY: -canvas.height / 2,
  c: { re: -0.7, im: 0.27015 }, //const for fractal calculations

  //modes
  bw: false,
  pause: false,
};

window.addEventListener("DOMContentLoaded", () => {
  setupInputs(canvas, state, () => draw(canvas,state));
  draw(canvas, state);
});
console.log("Main script loaded");