//HELPER FUNCTIONS FOR UI AND INPUTS
import {getFractal, FRACTALS, isRaymarch} from './fractals.js';
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

//3D MODE UI: keeps the 3D button and the controls that only make sense in 3D (the Height
//slider and Reset camera) in sync with state.view3d. Called when 3D is toggled, a preset is
//loaded, a type is chosen or 3D had to be turned off.
//A bulb type (Mandelbulb / Juliabulb) is 3D by itself: the terrain button and the Height slider
//make no sense there and are hidden, Reset camera stays (it resets the bulb's camera), and the
//"c z" slider (the third component of c) shows up.
export function updateView3DUI(state) {
    const bulb = isRaymarch(state.fractal);
    document.getElementById("view3dToggle").classList.toggle("toggled", state.view3d);
    document.getElementById("view3dToggle").classList.toggle("hidden", bulb);
    document.getElementById("heightLabel").classList.toggle("hidden", !state.view3d || bulb);
    document.getElementById("resetCamToggle").classList.toggle("hidden", !state.view3d && !bulb);
    //the hint under the button shows with it
    document.getElementById("camMoveHint").classList.toggle("hidden", !state.view3d && !bulb);
    document.getElementById("czLabel").classList.toggle("hidden", !bulb);
}
export function updateCzUI (czInput, state) {
    czInput.value = state.cz;
    document.getElementById("czValue").textContent = state.cz.toFixed(2);
}

//Enables / disables the bulb options of the type selector. The CPU renderer cannot draw them,
//so without the bulb renderer they are greyed out and say why.
export function setBulbOptionsEnabled(enabled) {
    for (const option of document.getElementById("fractalSelect").options) {
        const f = FRACTALS[option.value];
        if (!f || !f.needsWebGL) continue;
        option.disabled = !enabled;
        option.textContent = enabled ? f.name : `${f.name} (needs WebGL)`;
    }
}

//true when the type selector offers this type (a bulb on the CPU renderer is disabled there)
export function isTypeAvailable(key) {
    const option = document.querySelector(`#fractalSelect option[value="${key}"]`);
    return !option || !option.disabled;
}

//Refreshes every control that shows a value a type change can touch: the selector, the zoom
//field, c, c z, the power slider and the 3D-only controls. Used after a type change that did not
//come from the selector itself (the bulb renderer failing and falling back to Julia).
export function syncTypeUI(state) {
    updateFractalUI(document.getElementById("fractalSelect"), state);
    updateZoomUI(document.getElementById("zoomInput"), state);
    updateCUI(document.getElementById("cImInput"), document.getElementById("cReInput"), state);
    updateCzUI(document.getElementById("czInput"), state);
    updatePowerUI(document.getElementById("powerInput"), state);
    updateView3DUI(state);
}
export function updateHeightUI (heightInput, state) {
    heightInput.value = state.height3d;
    document.getElementById("heightValue").textContent = state.height3d;
}

//A short message at the bottom of the screen that fades away by itself (used when 3D fails)
let toastTimer = null;
export function showToast(text) {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
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
    //the inset is hidden in 3D: a screen position is no longer one complex point there
    const visible = !!partner && checkbox.checked && !state.view3d;
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
    const show = !!state.markerPoint && getFractal(state.fractal).kind === "mandelbrot" && !state.view3d;
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
    const show = !!state.pin && getFractal(state.fractal).kind === "mandelbrot" && !state.view3d;
    marker.classList.toggle("hidden", !show);
    if (!show) return;
    const pos = complexToScreen(state, document.getElementById("canvas"), state.pin.re, state.pin.im);
    marker.style.left = `${pos.x}px`;
    marker.style.top = `${pos.y}px`;
}
