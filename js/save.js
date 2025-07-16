import * as helpers from './helpers.js'
import {draw} from './draw.js';

export function saveSettings(state) {
    const saved = JSON.parse(localStorage.getItem("fractalPresets") || "{}"); //get existing presets or make a new one
    const name = prompt("Name this preset:");
    if(!name) return;

    saved[name] = {
        zoom: state.zoom,
        c: { re: state.c.re, im: state.c.im },
        hueBase: state.hueBase,
        hueSpeed: state.hueSpeed,
        bw: state.bw,
        simple: state.simple
    };
    localStorage.setItem("fractalPresets", JSON.stringify(saved));
    populateSavedDropdown();
    alert(`Saved as "${name}"`);


}

export function populateSavedDropdown() {
    const select = document.getElementById("savedSettingsSelect");
    select.innerHTML = `<option value="">-- Saved Settings --</option>`; //clears list

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

    state.zoom = chosen.zoom;
    state.c.re = chosen.c.re;
    state.c.im = chosen.c.im;
    state.hueBase = chosen.hueBase;
    state.hueSpeed = chosen.hueSpeed;
    state.bw = chosen.bw;

     //Get input elements
    const zoomInput = document.getElementById("zoomInput");
    const cReInput = document.getElementById("cReInput");
    const cImInput = document.getElementById("cImInput");
    const hueBaseInput = document.getElementById("hueBaseInput");
    const hueSpeedInput = document.getElementById("hueSpeedInput");
    const bwButton = document.getElementById("bwToggle");

    //Update UI
    helpers.updateZoomUI(zoomInput, state);
    helpers.updateCUI(cImInput, cReInput, state);
    helpers.updateHueBaseUI(hueBaseInput, state);
    helpers.updateHueSpeedUI(hueSpeedInput, state);

    if (state.bw) {
        bwButton.classList.add("toggled");
    } else {
        bwButton.classList.remove("toggled");
    }

    if(state.simple !== chosen.simple && chosen.simple !== undefined) {
        const simpleButton = document.getElementById("simpleToggle");
        helpers.updatesimpleUI(simpleButton, state);
    }
    state.simple = chosen.simple;

    if(!state.pause && chosen.pause !== undefined) {
        helpers.updatePauseUI(document.getElementById("pauseToggle"), state);
    }
    state.pause = true;
    draw();

    console.log(`Loaded setting "${selectedKey}":`, chosen);
}