import {draw} from './draw.js';
import {getFractal} from './fractals.js';
import {createGLRenderer} from './glRenderer.js';
import {setupInputs} from './inputs.js';

let canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

//Pick the renderer for a canvas ONCE. A canvas can only ever have one context type
//(getContext("2d") returns null after "webgl" was taken, and vice versa),
//so we cannot try WebGL later and fall back on the same canvas.
//Use ?renderer=cpu in the URL to force the CPU renderer.
//Returns {canvas, drawFrame, renderer}: the canvas may be a fresh clone (see below),
//so always use the returned one.
const forceCpu = new URLSearchParams(window.location.search).get("renderer") === "cpu";
function makeRenderer(canvas, allowGL = true) {
  let drawFrame = null; //set when WebGL works
  let renderer = "cpu";
  if (allowGL && !forceCpu) {
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
        //(cloneNode copies the id and the width/height attributes)
        const fresh = canvas.cloneNode(false);
        canvas.replaceWith(fresh);
        canvas = fresh;
      }
    }
  }
  return { canvas, drawFrame, renderer };
}

const main = makeRenderer(canvas);
canvas = main.canvas;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const drawFrame = main.drawFrame;
const renderer = main.renderer;
console.log(`Renderer: ${renderer}`);
window.renderer = renderer; //for debugging in the console

//the single draw function the rest of the app calls
function render() {
  if (drawFrame) drawFrame(state);
  else draw(canvas, state);
}

//JULIA PREVIEW: a second small canvas with its own renderer (a second WebGL context when
//the main one is WebGL, otherwise the CPU renderer). It reuses the same drawing code as the
//main canvas; only the state it is given differs.
let previewCanvas = document.getElementById("preview");
const prev = makeRenderer(previewCanvas, renderer === "webgl");
previewCanvas = prev.canvas;
const previewLabel = document.getElementById("previewLabel");

//Draws the Julia set for the complex point p = {re, im}. Takes the colours, modes,
//smoothness, power and iterations from the main state, and swaps in:
//  fractal = the Julia type that belongs to the current one (juliaOf),
//  c = p (the constant that picks the Julia set, see fractals.js),
//  a view centred on (0, 0) that shows 3 units from top to bottom.
function renderPreview(p) {
  const previewState = {
    ...state,
    fractal: getFractal(state.fractal).juliaOf,
    c: { re: p.re, im: p.im },
    zoom: previewCanvas.height / 3,
    offsetX: -previewCanvas.width / 2, //same convention as the main view: offset = centre*zoom - size/2
    offsetY: -previewCanvas.height / 2,
  };
  if (prev.drawFrame) prev.drawFrame(previewState);
  else draw(previewCanvas, previewState);
  previewLabel.textContent = `Julia at c = (${p.re.toFixed(3)}, ${p.im.toFixed(3)})`;
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
  setupInputs(canvas, state, {render, renderPreview});
  render();
});
console.log("Main script loaded");

window.state = state;