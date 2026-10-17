import * as helpers from './helpers.js'
import {getFractal} from './fractals.js';

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
        power: state.power,
        bw: state.bw,
        simple: state.simple,
        center: { re: state.center.re, im: state.center.im },
        autoIter: state.autoIter,
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
    state.pin = null; //the pinned preview point belongs to the old view too
    helpers.clearMainMarker(state); //a loaded preset is a new view, so the "came from" marker goes
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
    //presets saved before the Power slider used z^2
    state.power = chosen.power ?? 2;
    state.bw = chosen.bw;
    state.autoIter = chosen.autoIter ?? false; //older presets have no Auto iterations
    //Where the view sits. New presets store the centre directly. Presets saved before that
    //stored pixel offsets (offset = centre * zoom - size/2), so convert back:
    //    centre = (offset + size/2) / zoom
    //using the CURRENT canvas size (the same assumption the old code made). One saved
    //without offsets used the type's default centre.
    if (chosen.center) {
        state.center = { re: chosen.center.re, im: chosen.center.im };
    } else if (chosen.offsetX !== undefined && chosen.offsetY !== undefined) {
        const canvas = document.getElementById("canvas");
        state.center = {
            re: (chosen.offsetX + canvas.width / 2) / chosen.zoom,
            im: (chosen.offsetY + canvas.height / 2) / chosen.zoom,
        };
    } else {
        const d = getFractal(state.fractal).defaults.center;
        state.center = { re: d.re, im: d.im };
    }

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
    const powerInput = document.getElementById("powerInput");
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
    helpers.updatePowerUI(powerInput, state);

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