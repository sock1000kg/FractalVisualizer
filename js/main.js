import {draw} from './draw.js';
import {getFractal, FRACTALS, formatComplex} from './fractals.js';
import {complexToScreen} from './view.js';
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

//PREVIEW INSET: a second small canvas with its own renderer (a second WebGL context when
//the main one is WebGL, otherwise the CPU renderer). It reuses the same drawing code as the
//main canvas; only the state it is given differs.
let previewCanvas = document.getElementById("preview");
const prev = makeRenderer(previewCanvas, renderer === "webgl");
previewCanvas = prev.canvas;
const previewLabel = document.getElementById("previewLabel");
const previewMarker = document.getElementById("previewMarker");

//Draws the inset: the PARTNER of the main type (see kind / partner in fractals.js).
//Colours, modes, smoothness, power and iterations come from the main state; the rest is
//swapped in. What the inset shows depends on the role of the pixel in the main view:
//  - Mandelbrot kind (the pixel is the constant p): the inset is the Julia set whose
//    constant is the point p under the cursor. The complex point p = {re, im} is given.
//  - Julia kind (the pixel is the start z0, and state.c is the constant): the inset is the
//    partner Mandelbrot set, in ITS default view. It does not care about the cursor; it
//    follows state.c, and a crosshair marks where c sits inside that Mandelbrot set
//    ("you are here"). p is ignored.
function renderPreview(p) {
  const main = getFractal(state.fractal);
  const partnerKey = main.partner;
  const partner = FRACTALS[partnerKey];
  const zoom = previewCanvas.height / 3; //3 units from top to bottom
  let previewState;
  if (main.kind === "julia") {
    const d = partner.defaults;
    previewState = {
      ...state,
      fractal: partnerKey,
      c: { re: d.c.re, im: d.c.im }, //the partner's own start value z0 (normally 0)
      zoom,
      //same convention as the main view: offset = centre*zoom - size/2
      offsetX: d.center.re * zoom - previewCanvas.width / 2,
      offsetY: d.center.im * zoom - previewCanvas.height / 2,
    };
  } else {
    previewState = {
      ...state,
      fractal: partnerKey,
      c: { re: p.re, im: p.im }, //the constant that picks the Julia set (see fractals.js)
      zoom,
      offsetX: -previewCanvas.width / 2, //centred on (0, 0)
      offsetY: -previewCanvas.height / 2,
    };
  }
  if (prev.drawFrame) prev.drawFrame(previewState);
  else draw(previewCanvas, previewState);

  if (main.kind === "julia") {
    previewLabel.textContent = `${partner.formula(previewState)}   · marker = c = ${formatComplex(state.c)}`;
    placePreviewMarker(previewState);
  } else {
    previewLabel.textContent = partner.formula(previewState);
    previewMarker.classList.add("hidden");
  }
}

//Puts the crosshair over the inset at the point state.c. The inset is a WebGL canvas, so we
//cannot draw on it; the marker is a small HTML element laid over it instead. complexToScreen
//gives the position in canvas pixels; the canvas may be shown smaller than its pixel size
//(phones), so scale to CSS pixels, then add the canvas's offset inside #previewBox.
function placePreviewMarker(previewState) {
  const pos = complexToScreen(previewState, state.c.re, state.c.im);
  const inside = pos.x >= 0 && pos.x <= previewCanvas.width && pos.y >= 0 && pos.y <= previewCanvas.height;
  previewMarker.classList.toggle("hidden", !inside);
  if (!inside) return;
  const scaleX = previewCanvas.clientWidth / previewCanvas.width;
  const scaleY = previewCanvas.clientHeight / previewCanvas.height;
  previewMarker.style.left = `${previewCanvas.offsetLeft + pos.x * scaleX}px`;
  previewMarker.style.top = `${previewCanvas.offsetTop + pos.y * scaleY}px`;
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

  //where a Julia -> Mandelbrot jump came from: the complex point {re, im} that gets a "c"
  //crosshair on the main canvas, or null. Not saved in presets (see inputs.js)
  markerPoint: null,

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