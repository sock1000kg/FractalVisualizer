import * as helpers from './helpers.js'

export function saveSettings(state) {
    const saved = JSON.parse(localStorage.getItem("fractalPresets") || "{}"); //get existing presets or make a new one
    const name = prompt("Name this preset:");
    if(!name) return;

    saved[name] = {
        fractal: state.fractal,
        zoom: state.zoom,
        c: { re: state.c.re, im: state.c.im },
        hueBase: state.hueBase,
        hueSpeed: state.hueSpeed,
        maxIter: state.maxIter,
        saturation: state.saturation,
        lightness: state.lightness,
        smoothness: state.smoothness,
        bw: state.bw,
        simple: state.simple,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
    };
    localStorage.setItem("fractalPresets", JSON.stringify(saved));
    populateSavedDropdown();
    alert(`Saved as "${name}"`);


}

export function populateSavedDropdown() {
    const select = document.getElementById("savedSettingsSelect");
    select.innerHTML = `<option value="" disabled selected>-- Saved Settings --</option>`; //clears list

    //Populate dropdown with saved settings
    const saved = JSON.parse(localStorage.getItem("fractalPresets") || "{}");
    for(const name in saved) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }

    
}

export function loadSavedSettings(state, draw) {
    const select = document.getElementById("savedSettingsSelect");
    const saved = JSON.parse(localStorage.getItem("fractalPresets") || "{}");
    const chosen = saved[select.value];
    const selectedKey = select.value;
    if(!chosen) return;

    //presets saved before fractal types existed were all Julia
    state.fractal = chosen.fractal ?? "julia";
    state.zoom = chosen.zoom;
    state.c.re = chosen.c.re;
    state.c.im = chosen.c.im;
    state.hueBase = chosen.hueBase;
    state.hueSpeed = chosen.hueSpeed;
    //presets saved before these fields existed fall back to defaults;
    //?? (not ||) so a saved 0 for saturation/lightness stays valid
    state.maxIter = chosen.maxIter ?? 60;
    state.saturation = chosen.saturation ?? 70;
    state.lightness = chosen.lightness ?? 50;
    //presets saved before smooth colouring were banded, so 0 keeps them looking the same
    state.smoothness = chosen.smoothness ?? 0;
    state.bw = chosen.bw;
    state.offsetX = chosen.offsetX || -canvas.width / 2;
    state.offsetY = chosen.offsetY || -canvas.height / 2;

     //Get input elements
    const zoomInput = document.getElementById("zoomInput");
    const cReInput = document.getElementById("cReInput");
    const cImInput = document.getElementById("cImInput");
    const hueBaseInput = document.getElementById("hueBaseInput");
    const hueSpeedInput = document.getElementById("hueSpeedInput");
    const iterInput = document.getElementById("iterInput");
    const saturationInput = document.getElementById("saturationInput");
    const lightnessInput = document.getElementById("lightnessInput");
    const smoothInput = document.getElementById("smoothInput");
    const bwButton = document.getElementById("bwToggle");
    const fractalSelect = document.getElementById("fractalSelect");

    //Update UI (these helpers also refresh the value labels)
    helpers.updateFractalUI(fractalSelect, state);
    helpers.updateZoomUI(zoomInput, state);
    helpers.updateCUI(cImInput, cReInput, state);
    helpers.updateHueBaseUI(hueBaseInput, state);
    helpers.updateHueSpeedUI(hueSpeedInput, state);
    helpers.updateMaxIterUI(iterInput, state);
    helpers.updateSaturationUI(saturationInput, state);
    helpers.updateLightnessUI(lightnessInput, state);
    helpers.updateSmoothnessUI(smoothInput, state);

    if (state.bw) {
        bwButton.classList.add("toggled");
    } else {
        bwButton.classList.remove("toggled");
    }

    if(state.simple !== chosen.simple && chosen.simple !== undefined) {
        const simpleButton = document.getElementById("simpleToggle");
        helpers.updatesimpleUI(simpleButton, state);
        state.simple = chosen.simple;
    }

    if(!state.pause && state.pause !== undefined) {
        state.pause = true;
        helpers.updatePauseUI(document.getElementById("pauseToggle"), state);
    }
    draw();

    console.log(`Loaded setting "${selectedKey}":`, chosen);
}