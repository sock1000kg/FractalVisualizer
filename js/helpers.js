//HELPER FUNCTIONS FOR UI AND INPUTS
import {getFractal, FRACTALS} from './fractals.js';
import {complexToScreen, magnification, formatMagnification, iterToSlider, autoIterations} from './view.js';

export function pause(state) {
    state.pause = !state.pause;
}
export function updatePauseUI(pauseButton, state) {
    pauseButton.classList.toggle("toggled");
    pauseButton.textContent = state.pause ? "Paused (P)" : "Pause (P)";
    console.log("Pause updated");
}
export function updateBWUI (bwButton) {
    bwButton.classList.toggle("toggled");
    console.log("BW updated");
}
//the zoom field shows the MAGNIFICATION (1 = the type's default view), e.g. 2.5 or 3.2×10⁹
export function updateZoomUI (zoomInput, state) {
    zoomInput.value = formatMagnification(magnification(state));
}
export function updateCUI (cImInput, cReInput, state) {
    cImInput.value = state.c.im;
    cReInput.value = state.c.re;
}
export function updateHueBaseUI (hueBaseInput, state) {
    hueBaseInput.value = state.hueBase.toFixed(2);
    //keep the label next to the slider in sync (also needed after loading a preset)
    document.getElementById("hueBaseValue").textContent = state.hueBase;
}
export function updateHueSpeedUI (hueSpeedInput, state) {
    hueSpeedInput.value = state.hueSpeed.toFixed(2);
    document.getElementById("hueSpeedValue").textContent = state.hueSpeed;
}
//Auto iterations: while it is on, maxIter is computed from the zoom instead of the slider.
//Called on every draw, so any zoom change (wheel, pinch, field, type, preset) is covered.
//Returns true when the value changed (the slider and its label then need a refresh).
export function applyAutoIter(state) {
    if (!state.autoIter) return false;
    const n = autoIterations(magnification(state));
    const changed = n !== state.maxIter;
    state.maxIter = n;
    return changed;
}

//Sets the iterations slider, its value label and the Auto checkbox. The slider is on a log
//scale (see iterToSlider in view.js), and is disabled while Auto drives the value.
export function updateMaxIterUI (iterInput, state) {
    iterInput.value = iterToSlider(state.maxIter);
    iterInput.disabled = !!state.autoIter;
    document.getElementById("iterAutoToggle").checked = !!state.autoIter;
    document.getElementById("iterValue").textContent = state.maxIter;
}

//Shows the warning line under the formula when the magnification passes the limit of the
//current renderer. `limit` is a number, or a function state => number (WebGL: about 1e11 or
//1e5 depending on the state; the CPU's doubles: 1e13).
export function updatePrecisionWarning(state, limit) {
    document.getElementById("precisionWarning").classList.toggle("hidden", magnification(state) <= (typeof limit === "function" ? limit(state) : limit));
}

//the two helpers below set both the slider and its value label
export function updateSmoothnessUI (smoothInput, state) {
    smoothInput.value = state.smoothness;
    document.getElementById("smoothValue").textContent = state.smoothness;
}
export function updatePowerUI (powerInput, state) {
    powerInput.value = state.power;
    document.getElementById("powerValue").textContent = state.power.toFixed(1);
}
export function updateSaturationUI (saturationInput, state) {
    saturationInput.value = state.saturation;
    document.getElementById("saturationValue").textContent = state.saturation;
}
export function updateLightnessUI (lightnessInput, state) {
    lightnessInput.value = state.lightness;
    document.getElementById("lightnessValue").textContent = state.lightness;
}
export function updatesimpleUI(simpleButton, state) {
    simpleButton.classList.toggle("toggled");
    console.log("Simple updated");
}
//keeps the type selector in sync with state.fractal (used after loading a preset)
export function updateFractalUI(fractalSelect, state) {
    fractalSelect.value = state.fractal;
}

//Keeps the preview toggle and the inset box in sync with the current type.
//  - A type without a partner has nothing to preview, so the whole toggle is hidden.
//  - Otherwise its label names the partner ("Julia preview", "Mandelbrot preview", ...).
//Returns true when the inset is visible (a partner exists AND the checkbox is on).
export function updatePreviewVisibility(state, checkbox) {
    const partnerKey = getFractal(state.fractal).partner;
    const partner = FRACTALS[partnerKey];
    document.getElementById("previewToggleLabel").classList.toggle("hidden", !partner);
    if (partner) document.getElementById("previewToggleText").textContent = `${partner.name} preview`;
    const visible = !!partner && checkbox.checked;
    document.getElementById("previewBox").classList.toggle("hidden", !visible);
    return visible;
}

//Replaces the content of `el` with one <div> per line. Each line is set with textContent
//(never innerHTML), so the values can never be read as HTML. An optional second argument per
//line is a CSS class (used for the dimmed hint line).
export function setLines(el, lines) {
    el.replaceChildren(...lines.map(([text, className]) => {
        const div = document.createElement("div");
        div.textContent = text;
        if (className) div.className = className;
        return div;
    }));
}

//The equation of the main view, with the live values (see formula in fractals.js):
//line 1 is "title: equation", line 2 the meaning of the pixel and of c
export function updateFormula(state) {
    const f = getFractal(state.fractal).formula(state);
    setLines(document.getElementById("formula"), [[`${f.title}: ${f.eq}`], [f.vars]]);
}

//The "c" crosshair left on the main canvas after a Julia -> Mandelbrot jump. It sits on a
//fixed complex point (state.markerPoint), so it is repositioned after every render: panning
//and zooming change where that point is on screen. Only shown on a Mandelbrot-kind type.
export function updateMainMarker(state) {
    const marker = document.getElementById("cMarker");
    const show = !!state.markerPoint && getFractal(state.fractal).kind === "mandelbrot";
    marker.classList.toggle("hidden", !show);
    if (!show) return;
    const pos = complexToScreen(state, document.getElementById("canvas"), state.markerPoint.re, state.markerPoint.im);
    marker.style.left = `${pos.x}px`;
    marker.style.top = `${pos.y}px`;
}

//Timer ids of the running "c" marker flash. Kept at module level so a new flash, a type change
//or a preset load can cancel the old timers (otherwise they would hide the marker too early).
let fadeTimer = null;
let hideTimer = null;

function cancelMarkerTimers() {
    clearTimeout(fadeTimer);
    clearTimeout(hideTimer);
    fadeTimer = hideTimer = null;
}

//Removes the "c" marker immediately: stops any pending fade, forgets the point and hides it.
export function clearMainMarker(state) {
    cancelMarkerTimers();
    state.markerPoint = null;
    updateMainMarker(state);
}

//Shows the "c" marker (state.markerPoint must already be set) as a short flash: fully visible
//for 1.2 s, then the CSS opacity transition fades it, and at 2 s it is removed. Calling it again
//restarts the whole sequence.
export function flashMainMarker(state) {
    cancelMarkerTimers();
    document.getElementById("cMarker").classList.remove("fade"); //back to fully visible
    updateMainMarker(state);
    fadeTimer = setTimeout(() => {
        document.getElementById("cMarker").classList.add("fade"); //CSS transition does the fading
    }, 1200);
    hideTimer = setTimeout(() => {
        clearMainMarker(state);
    }, 2000);
}

//The "p" crosshair of a PINNED preview (Mandelbrot types: click the canvas to freeze the inset
//at that point). Same idea as the "c" marker: it sits on a fixed complex point (state.pin), so
//it is repositioned after every render to follow panning and zooming.
export function updatePinMarker(state) {
    const marker = document.getElementById("pinMarker");
    const show = !!state.pin && getFractal(state.fractal).kind === "mandelbrot";
    marker.classList.toggle("hidden", !show);
    if (!show) return;
    const pos = complexToScreen(state, document.getElementById("canvas"), state.pin.re, state.pin.im);
    marker.style.left = `${pos.x}px`;
    marker.style.top = `${pos.y}px`;
}
