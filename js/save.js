import * as helpers from './helpers.js'
import {getFractal} from './fractals.js';
import {applyFractalDefaults} from './view.js';
import {DEFAULT_CAM, BULB_TARGET} from './mat4.js';

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
        view3d: state.view3d,
        height3d: state.height3d,
        cam3d: { yaw: state.cam3d.yaw, pitch: state.cam3d.pitch, dist: state.cam3d.dist, target: [...(state.cam3d.target ?? DEFAULT_CAM.target)] },
        cz: state.cz,
        camBulb: { yaw: state.camBulb.yaw, pitch: state.camBulb.pitch, dist: state.camBulb.dist, target: [...(state.camBulb.target ?? BULB_TARGET)] },
        //the Mandelbox: its scale and the fly camera (position, look angles and speed)
        scale: state.scale,
        camFly: { pos: [...state.camFly.pos], yaw: state.camFly.yaw, pitch: state.camFly.pitch, speed: state.camFly.speed },
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
    //3D terrain: presets saved before it existed open in 2D. A preset saved in 3D opens in 2D
    //when 3D is not available here (its button is disabled, e.g. on the CPU renderer).
    state.view3d = (chosen.view3d ?? false) && !document.getElementById("view3dToggle").disabled;
    state.height3d = chosen.height3d ?? 35;
    state.cam3d = { ...DEFAULT_CAM, ...chosen.cam3d };
    //the bulbs (older presets have none of this): the third component of c and the bulb camera,
    //on top of the Mandelbulb's own default framing
    state.cz = chosen.cz ?? 0;
    state.camBulb = { ...getFractal("mandelbulb").defaults.cam, ...chosen.camBulb };
    //the Mandelbox (presets saved before it existed have neither): its scale and fly camera, on top
    //of its default start. The position is copied so the preset object and the state never share it.
    const flyDefaults = getFractal("mandelbox").defaults;
    state.scale = chosen.scale ?? flyDefaults.scale;
    state.camFly = { ...flyDefaults.camFly, ...chosen.camFly, pos: [...(chosen.camFly?.pos ?? flyDefaults.camFly.pos)] };
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

    //A 3D preset (bulb or Mandelbox) on the CPU renderer cannot be drawn (the selector disables those
    //options there), so fall back to Julia with its own defaults, and say so.
    const fellBack = !helpers.isTypeAvailable(state.fractal);
    if (fellBack) {
        const bulbName = getFractal(state.fractal).name;
        state.fractal = "julia";
        applyFractalDefaults(state, chosen.fractal); //Julia's view; also puts the bulb's power back to 2
        helpers.showToast(`"${bulbName}" needs WebGL, showing Julia instead`);
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
    helpers.updateCzUI(document.getElementById("czInput"), state);
    helpers.updateScaleUI(document.getElementById("scaleInput"), state);
    helpers.updateHeightUI(document.getElementById("heightInput"), state);
    helpers.updateView3DUI(state);

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