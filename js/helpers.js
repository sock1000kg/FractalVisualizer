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
}
export function updateHueSpeedUI (hueSpeedInput, state) {
    hueSpeedInput.value = state.hueSpeed.toFixed(2);
}