//HELPER FUNCTIONS FOR UI AND INPUTS
import {getFractal, FRACTALS} from './fractals.js';
import {complexToScreen} from './view.js';

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
export function updateZoomUI (zoomInput, state) {
    zoomInput.value = state.zoom.toFixed(2); 
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
//the three helpers below set both the slider and its value label
export function updateMaxIterUI (iterInput, state) {
    iterInput.value = state.maxIter;
    document.getElementById("iterValue").textContent = state.maxIter;
}
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

//The equation line of the main view, with the live values (see formula in fractals.js)
export function updateFormula(state) {
    document.getElementById("formula").textContent = getFractal(state.fractal).formula(state);
}

//The "c" crosshair left on the main canvas after a Julia -> Mandelbrot jump. It sits on a
//fixed complex point (state.markerPoint), so it is repositioned after every render: panning
//and zooming change where that point is on screen. Only shown on a Mandelbrot-kind type.
export function updateMainMarker(state) {
    const marker = document.getElementById("cMarker");
    const show = !!state.markerPoint && getFractal(state.fractal).kind === "mandelbrot";
    marker.classList.toggle("hidden", !show);
    if (!show) return;
    const pos = complexToScreen(state, state.markerPoint.re, state.markerPoint.im);
    marker.style.left = `${pos.x}px`;
    marker.style.top = `${pos.y}px`;
}
