import {draw} from './draw.js';
import {createGLRenderer} from './glRenderer.js';
import {setupInputs} from './inputs.js';

let canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

//Pick the renderer ONCE. A canvas can only ever have one context type
//(getContext("2d") returns null after "webgl" was taken, and vice versa),
//so we cannot try WebGL later and fall back on the same canvas.
//Use ?renderer=cpu in the URL to force the CPU renderer.
let renderer = "cpu";
let drawFrame = null; //set when WebGL works
if (new URLSearchParams(window.location.search).get("renderer") !== "cpu") {
  //preserveDrawingBuffer keeps the image after it is shown, which
  //canvas.toDataURL (the Download button) needs to capture it
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (gl) {
    try {
      drawFrame = createGLRenderer(canvas, gl);
      renderer = "webgl";
    } catch (e) {
      console.error("WebGL renderer failed, using CPU:", e);
      //this canvas is now locked to WebGL, so swap in a fresh clone
      //that has no context yet and can give us a 2D context
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvas = fresh;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }
}
console.log(`Renderer: ${renderer}`);
window.renderer = renderer; //for debugging in the console

//the single draw function the rest of the app calls
function render() {
  if (drawFrame) drawFrame(state);
  else draw(canvas, state);
}

const state = {
  //for zooming
  baseZoom: 400,
  zoom: 300,

  //color variables
  hueBase: 0,
  hueSpeed: 10,
  saturation: 70, //HSL saturation % (color mode only)
  lightness: 50, //HSL lightness % (color mode only)

  //smooth colouring: 0 = banded (the old look) .. 100 = fully smooth; applies to every mode
  smoothness: 100,

  //power n of the iteration z -> z^n + k: 2 (the classic look) .. 8, fractional values allowed
  power: 2,

  //fractal depth: max iterations per pixel, shared by every mode
  //(higher = more detail but slower to draw)
  maxIter: 60,

  //declare (0,0) for the fractal's canvas
  offsetX: -canvas.width / 2,
  offsetY: -canvas.height / 2,
  c: { re: -0.7, im: 0.27015 }, //const for fractal calculations

  //key into FRACTALS in fractals.js (changed by the type selector)
  fractal: "julia",

  //modes
  bw: false,
  simple: false,
  pause: false,
};

window.addEventListener("DOMContentLoaded", () => {
  setupInputs(canvas, state, render);
  render();
});
console.log("Main script loaded");

window.state = state;