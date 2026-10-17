//HELPER FUNCTIONS FOR UI AND INPUTS
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
