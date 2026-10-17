import {draw} from './draw.js';
import {getFractal, FRACTALS, formatComplex, isRaymarch} from './fractals.js';
import {applyFractalDefaults} from './view.js';
import {complexToScreen} from './view.js';
import {createGLRenderer, FLOAT_LIMIT} from './glRenderer.js';
import {createTerrainRenderer} from './terrainRenderer.js';
import {createBulbRenderer} from './bulbRenderer.js';
import {DEFAULT_CAM} from './mat4.js';
import {setupInputs} from './inputs.js';
import {setLines, updateView3DUI, showToast, syncTypeUI, setBulbOptionsEnabled} from './helpers.js';

let canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

//Pick the renderer for a canvas ONCE. A canvas can only ever have one context type
//(getContext("2d") returns null after "webgl" was taken, and vice versa),
//so we cannot try WebGL later and fall back on the same canvas.
//Use ?renderer=cpu in the URL to force the CPU renderer.
//Returns {canvas, drawFrame, limitFor, drawTerrain, drawBulb, renderer}: the canvas may be a fresh
//clone (see below), so always use the returned one. drawTerrain and drawBulb are the 3D renderers
//(the terrain and the Mandelbulb / Juliabulb; only built when withTerrain is set, i.e. for the
//main canvas; null on the CPU or if they cannot be set up).
const forceCpu = new URLSearchParams(window.location.search).get("renderer") === "cpu";
function makeRenderer(canvas, allowGL = true, withTerrain = false) {
  let drawFrame = null; //set when WebGL works
  let limitFor = null; //WebGL only: state -> magnification where the picture stops being accurate
  let drawTerrain = null; //set when WebGL works and the 3D terrain renderer could be built
  let drawBulb = null; //same for the bulb renderer (it compiles its shaders lazily, so this rarely fails)
  let renderer = "cpu";
  if (allowGL && !forceCpu) {
    //preserveDrawingBuffer keeps the image after it is shown, which
    //canvas.toDataURL (the Download button) needs to capture it
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
    if (gl) {
      try {
        const gr = createGLRenderer(canvas, gl);
        drawFrame = gr.draw;
        limitFor = gr.limitFor;
        renderer = "webgl";
        if (withTerrain) {
          //a failure here only costs the 3D mode (its button stays disabled), never the 2D view
          try {
            drawTerrain = createTerrainRenderer(canvas, gl).draw;
          } catch (e) {
            console.error("3D terrain renderer unavailable:", e);
          }
          //a failure here only costs the bulb types (their options stay disabled)
          try {
            drawBulb = createBulbRenderer(canvas, gl).draw;
          } catch (e) {
            console.error("Bulb renderer unavailable:", e);
          }
        }
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
  return { canvas, drawFrame, limitFor, drawTerrain, drawBulb, renderer };
}

const main = makeRenderer(canvas, true, true);
canvas = main.canvas;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const drawFrame = main.drawFrame;
const renderer = main.renderer;
console.log(`Renderer: ${renderer}`);
window.renderer = renderer; //for debugging in the console

//The magnification where the picture stops being accurate, per state (used for the warning).
//WebGL asks its renderer: about 1e11x with the double-float shader (whole powers), 1e5x with
//plain floats (fractional powers, or a GPU where double-float is not reliable). The CPU uses
//doubles (~16 digits) and holds until about 1e13x.
//The 3D terrain always uses plain floats (no double-float in a vertex shader), so its limit is 1e5.
//The bulbs have no limit (their zoom is the camera distance, which is clamped), so no warning.
const precisionLimit = (s) => isRaymarch(s.fractal) ? Infinity : s.view3d ? FLOAT_LIMIT : main.limitFor ? main.limitFor(s) : 1e13;

//the single draw function the rest of the app calls
function render() {
  //A bulb type (Mandelbulb / Juliabulb) has its own raymarching renderer. If its shader fails
  //(a driver that rejects it), switch back to Julia for good and carry on with the 2D picture below.
  if (isRaymarch(state.fractal)) {
    try {
      main.drawBulb(state);
      return;
    } catch (e) {
      console.error("Bulb renderer failed, back to Julia:", e);
      main.drawBulb = null;
      const previous = state.fractal;
      state.fractal = "julia";
      applyFractalDefaults(state, previous);
      setBulbOptionsEnabled(false);
      syncTypeUI(state);
      showToast("The 3D bulbs are not available on this GPU: " + String(e.message).split("\n")[0]);
    }
  }
  //3D: draw the terrain. If its shader fails (a driver that rejects it), turn 3D off for good
  //and carry on with the normal 2D picture below.
  if (state.view3d && main.drawTerrain) {
    try {
      main.drawTerrain(state);
      return;
    } catch (e) {
      console.error("3D terrain failed, back to 2D:", e);
      main.drawTerrain = null;
      state.view3d = false;
      updateView3DUI(state);
      showToast("3D mode is not available on this GPU: " + e.message.split("\n")[0]);
    }
  }
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
//touch screens have no hover or right-click, so the hint line words things differently there
const COARSE_POINTER = window.matchMedia("(pointer: coarse)").matches;

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
      center: { re: d.center.re, im: d.center.im }, //the partner's default centre
    };
  } else {
    previewState = {
      ...state,
      fractal: partnerKey,
      c: { re: p.re, im: p.im }, //the constant that picks the Julia set (see fractals.js)
      zoom,
      center: { re: 0, im: 0 }, //centred on (0, 0)
    };
  }
  if (prev.drawFrame) prev.drawFrame(previewState);
  else draw(previewCanvas, previewState);

  //Caption, one <div> per line: "title: equation", then the meaning of the variables, then
  //what the link to the main view is, then a dimmed hint about clicking.
  const f = partner.formula(previewState);
  const lines = [[`${f.title}: ${f.eq}`], [f.vars]];
  if (main.kind === "julia") {
    //The Mandelbrot image NEVER depends on c: it is a map of ALL the c values at once. So it
    //does not change while c moves; only the crosshair does. It marks the p that equals your c.
    lines.push([`✛ = p equal to your c (${formatComplex(state.c)})`]);
    placePreviewMarker(previewState);
  } else {
    //the inset (a Julia set) is drawn for the constant c = p, the point under the cursor
    //or, after a click on the canvas, the pinned point
    const which = state.pin ? "pinned p" : "p under the cursor";
    lines.push([`c = ${which} (${formatComplex(p)})`]);
    previewMarker.classList.add("hidden");
  }
  lines.push([COARSE_POINTER ? "tap here to open"
    : main.kind === "julia" ? "click canvas to freeze c · click here to open"
    : "click canvas to pin · click here to open", "hint"]);
  setLines(previewLabel, lines);
}

//Puts the crosshair over the inset at the point state.c. The inset is a WebGL canvas, so we
//cannot draw on it; the marker is a small HTML element laid over it instead. complexToScreen
//gives the position in canvas pixels; the canvas may be shown smaller than its pixel size
//(phones), so scale to CSS pixels, then add the canvas's offset inside #previewBox.
function placePreviewMarker(previewState) {
  const pos = complexToScreen(previewState, previewCanvas, state.c.re, state.c.im);
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
  //Auto iterations: maxIter follows the zoom (see autoIterations in view.js) instead of the slider
  autoIter: false,

  //the complex number at the middle of the canvas (see view.js for the view model)
  center: { re: 0, im: 0 },
  c: { re: -0.7, im: 0.27015 }, //const for fractal calculations

  //key into FRACTALS in fractals.js (changed by the type selector)
  fractal: "julia",

  //where a Julia -> Mandelbrot jump came from: the complex point {re, im} that gets a "c"
  //crosshair on the main canvas, or null. Not saved in presets (see inputs.js)
  markerPoint: null,

  //Mandelbrot types: the complex point {re, im} the inset is pinned to by a click on the
  //canvas, or null while the inset follows the cursor. Cleared by Esc, another click, a type
  //change, a preset or a jump. Not saved in presets.
  pin: null,

  //the 3D bulbs (see bulbRenderer.js): the third component of the constant (c.re, c.im, cz),
  //and their own orbit camera (separate from the terrain's cam3d: the framing differs)
  cz: 0,
  camBulb: { yaw: 0.6, pitch: 0.35, dist: 3.0 },

  //3D terrain mode (see terrainRenderer.js): the 2D fractal shown as a lit landscape
  view3d: false,
  height3d: 35, //Height slider 0..100 (how tall the terrain is)
  cam3d: { ...DEFAULT_CAM }, //orbit camera: yaw, pitch (radians), dist (see mat4.js)

  //modes
  bw: false,
  simple: false,
  pause: false,
};

window.addEventListener("DOMContentLoaded", () => {
  setupInputs(canvas, state, {render, renderPreview, precisionLimit, has3D: !!main.drawTerrain, hasBulb: !!main.drawBulb});
  render();
});
console.log("Main script loaded");

window.state = state;