//View helpers: the ONE place that turns the view (state.center + state.zoom) into the complex
//plane and back. draw.js and the WebGL shader repeat the same formula, so keep them in sync.
//
//THE VIEW MODEL
//  state.center = {re, im}   the complex number at the middle of the canvas
//  state.zoom                pixels per unit of the complex plane
//and a pixel (sx, sy) on a canvas of size width x height is the complex number
//    re = center.re + (sx - width/2)  / zoom
//    im = center.im + (sy - height/2) / zoom
//
//WHY THE CENTRE (and not a pixel offset like before)
//A JavaScript number (a "double") keeps about 16 significant digits. A GPU float keeps only
//about 7. The old model stored offset = centre * zoom - width/2. At a zoom of 10^13 that
//offset is a number with 13+ digits in front of the point, so a float has nothing left for
//the digits that matter and the image falls apart. Now the centre is stored as it is, and
//the thing added to it, (sx - width/2) / zoom, is SMALL (a few pixels divided by a big zoom),
//so it keeps all its digits. Only the centre needs extra precision (next milestone).
import {getFractal, isRaymarch} from './fractals.js';

//MAGNIFICATION: what the user sees. 1x is every type's own default view, so
//magnification = zoom / default zoom. The range is limited below by 0.1 (zoomed far out) and
//above by 1e15: past that even JavaScript doubles (16 digits) cannot tell two neighbouring
//pixels apart, so there is nothing more to see.
export const MIN_MAGNIFICATION = 0.1;
export const MAX_MAGNIFICATION = 1e15;

//For a 3D bulb there is no zoom in pixels per unit: its "zoom" is how close the camera is, so
//the magnification is the default camera distance divided by the current one (2x = half as far).
export function magnification(state) {
    const f = getFractal(state.fractal);
    if (isRaymarch(state.fractal)) return f.defaults.cam.dist / state.camBulb.dist;
    return state.zoom / f.defaults.zoom;
}

//the zoom (pixels per unit) clamped to the allowed magnification range for the current type
export function clampZoom(state, zoom) {
    const base = getFractal(state.fractal).defaults.zoom;
    return Math.max(MIN_MAGNIFICATION * base, Math.min(MAX_MAGNIFICATION * base, zoom));
}

//complex point at the middle of the canvas (a copy, so callers cannot change the view by accident)
export function getViewCenter(state) {
    return {re: state.center.re, im: state.center.im};
}

//put (re, im) in the middle of the canvas
export function setViewCenter(state, re, im) {
    state.center = {re, im};
}

//jump to the selected fractal's default c, zoom and centre.
//prevKey is the type we are coming from (state.fractal is already the new one). A bulb sets
//its own power (8), c, cz and camera instead of zoom and centre. Leaving a bulb for a 2D type
//puts the power back to 2: the bulbs' power 8 would make a 2D picture look odd, and the user
//did not choose it for 2D. This is done ONLY when the previous type was a bulb, so switching
//between two 2D types keeps whatever power the user set, as before.
export function applyFractalDefaults(state, prevKey = state.fractal) {
    const d = getFractal(state.fractal).defaults;
    state.c = { re: d.c.re, im: d.c.im }; //new object so the registry's defaults are never mutated
    if (isRaymarch(state.fractal)) {
        state.cz = d.cz;
        state.power = d.power;
        state.camBulb = { ...d.cam };
        return;
    }
    if (isRaymarch(prevKey)) state.power = 2;
    state.zoom = d.zoom;
    setViewCenter(state, d.center.re, d.center.im);
}

//drag the picture by (dxPixels, dyPixels) on screen. Dragging the image right means the
//view moves left in the plane, hence the minus. Dividing by zoom turns pixels into plane units.
export function panBy(state, dxPixels, dyPixels) {
    state.center.re -= dxPixels / state.zoom;
    state.center.im -= dyPixels / state.zoom;
}

//the complex number under screen pixel (sx, sy): the mapping at the top of this file.
//`size` is anything with width and height (the canvas itself, or {width, height}).
//Used by the Julia preview and click-to-pin, which need "the point under the cursor".
export function screenToComplex(state, size, sx, sy) {
    return {
        re: state.center.re + (sx - size.width / 2) / state.zoom,
        im: state.center.im + (sy - size.height / 2) / state.zoom,
    };
}

//the inverse of screenToComplex: the screen pixel where the complex number (re, im) is drawn.
//Used to place the crosshair markers on top of the canvases.
export function complexToScreen(state, size, re, im) {
    return {
        x: (re - state.center.re) * state.zoom + size.width / 2,
        y: (im - state.center.im) * state.zoom + size.height / 2,
    };
}

//zoom to newZoom while keeping the complex point under screen pixel (sx, sy) fixed.
//Used by the pinch gesture (the point between the fingers stays there) and the mouse wheel
//(the point under the cursor stays there).
//  1. find the complex number p under the pixel
//  2. change the zoom
//  3. move the centre so p is under the same pixel again:
//         p = center' + (sx - width/2) / newZoom   =>   center' = p - (sx - width/2) / newZoom
//Zooming around the screen centre is the special case (sx, sy) = (width/2, height/2),
//where the centre does not move at all.
export function zoomAt(canvas, state, sx, sy, newZoom) {
    const p = screenToComplex(state, canvas, sx, sy);
    state.zoom = newZoom;
    state.center = {
        re: p.re - (sx - canvas.width / 2) / newZoom,
        im: p.im - (sy - canvas.height / 2) / newZoom,
    };
}

//MAGNIFICATION TEXT
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

//Text for the zoom field. Below 10^4 a plain number with up to 2 decimals (1, 2.5, 350);
//from 10^4 up scientific notation with a superscript exponent (3.2×10⁹), because 3200000000
//is hard to read. toExponential(1) gives "3.2e+9": a mantissa with 1 decimal and the exponent
//(it also carries 9.96e3 over to 1.0e4 for us); a trailing ".0" is dropped.
export function formatMagnification(m) {
    if (m < 1e4) return String(+m.toFixed(2));
    const [mant, exp] = m.toExponential(1).split("e");
    const sup = String(Math.abs(+exp)).replace(/\d/g, (d) => SUPERSCRIPT[d]);
    return `${mant.replace(/\.0$/, "")}×10${exp.startsWith("-") ? "⁻" : ""}${sup}`;
}

//Reads what a user typed in the zoom field. Accepts 1500, 2.5, 1e9, 1E9, 3.2x10^9, 3.2×10^9
//and also the superscript form we display (3.2×10⁹). Returns NaN for anything else
//(or for zero / negative numbers), and then the caller changes nothing.
export function parseMagnification(text) {
    let s = String(text).trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, "");
    //superscript digits (and ⁻) -> ordinary ones, so "10⁹" becomes "10^9"
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) =>
        "^" + [...run].map((ch) => ch === "⁻" ? "-" : SUPERSCRIPT.indexOf(ch)).join(""));
    const m = /^(\d+\.?\d*|\.\d+)(?:e([+-]?\d+)|x10\^?([+-]?\d+))?$/.exec(s);
    if (!m) return NaN;
    const value = Number(m[1]) * 10 ** Number(m[2] ?? m[3] ?? 0);
    return value > 0 && Number.isFinite(value) ? value : NaN;
}

//ITERATIONS
//The iterations slider is logarithmic: it runs over 0..1000 and the value is
//iter = round(10 * 500^(v/1000)), i.e. 10 at the left end and 5000 at the right end.
//Why a log scale: a plain 10..5000 slider would spend almost all its length on values
//nobody needs (say 3000 vs 3100) and leave only a sliver for 10..100, where one step
//changes the picture a lot. Equal slider steps now mean equal PERCENTAGE changes.
export const MIN_ITER = 10;
export const MAX_ITER = 5000;
export const ITER_SLIDER_MAX = 1000;

export function sliderToIter(v) {
    return Math.round(MIN_ITER * (MAX_ITER / MIN_ITER) ** (v / ITER_SLIDER_MAX));
}

export function iterToSlider(iter) {
    return Math.round(ITER_SLIDER_MAX * Math.log(iter / MIN_ITER) / Math.log(MAX_ITER / MIN_ITER));
}

//AUTO ITERATIONS: deeper views have finer detail, which needs more iterations to resolve.
//60 at 1x, 300 at 100x, about 1600 at 10^13x (+120 per factor of 10 in magnification).
export function autoIterations(mag) {
    const n = Math.round(60 + 120 * Math.log10(Math.max(mag, 1)));
    return Math.max(MIN_ITER, Math.min(MAX_ITER, n));
}
