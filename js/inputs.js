import * as helpers from './helpers.js';
import {FRACTALS, getFractal, isRaymarch} from './fractals.js';
import {setViewCenter, applyFractalDefaults, zoomAt, panBy, screenToComplex, clampZoom, magnification,
        parseMagnification, sliderToIter} from './view.js';
import {saveSettings, populateSavedDropdown, loadSavedSettings} from './save.js';
import {DEFAULT_CAM, clampCam, BULB_LIMITS} from './mat4.js';

//api = {render, renderPreview, precisionLimit, has3D, hasBulb}: render() draws the main canvas, renderPreview(p)
//draws the inset (the partner of the current type; p is the complex point under the cursor,
//which only matters on Mandelbrot-style types). precisionLimit is the magnification past
//which the current renderer gets inaccurate (see main.js); it drives the warning line.
//has3D / hasBulb say whether the terrain / bulb renderers could be built (WebGL only).
export function setupInputs(canvas, state, api){
    const preview = createPreview(canvas, state, api.renderPreview);
    //Every redraw of the main canvas also refreshes the inset, the formula line and the
    //"c" marker, so a slider, mode, preset or type change is picked up by all of them
    //without touching each handler.
    const draw = () => {
        //Auto iterations: recompute the count from the zoom BEFORE drawing
        if (helpers.applyAutoIter(state)) helpers.updateMaxIterUI(document.getElementById("iterInput"), state);
        api.render();
        helpers.updateFormula(state);
        helpers.updateMainMarker(state);
        helpers.updatePinMarker(state);
        helpers.updatePrecisionWarning(state, api.precisionLimit);
        preview.refresh();
    };
    setupButtons(canvas, state, draw);
    setupMouseTrack(canvas, state, draw, preview);
    setupTouch(canvas, state, draw, preview);
    setupVariablesInputs(canvas, state, draw, api.hasBulb);
    setupView3D(state, draw, api.has3D);
    setupPreviewToggle(state, preview, canvas, draw);
    setupWindowResize(canvas, state, draw);
    populateSavedDropdown();
    //first paint of the pieces that normally refresh on every draw
    helpers.updateFormula(state);
    helpers.updateZoomUI(document.getElementById("zoomInput"), state);
    helpers.updateMaxIterUI(document.getElementById("iterInput"), state);
    helpers.updatePrecisionWarning(state, api.precisionLimit);
    preview.refresh();
}

//3D TERRAIN CONTROLS (the camera itself is driven by the mouse and touch handlers below)
//  - the 3D button toggles state.view3d. It is disabled without WebGL (the CPU renderer cannot
//    draw the terrain), with a tooltip saying why.
//  - Height scales the terrain; Reset camera restores the default orbit angles and distance.
//  - Both only show in 3D (helpers.updateView3DUI).
function setupView3D(state, draw, has3D) {
    const button = document.getElementById("view3dToggle");
    if (!has3D) {
        button.disabled = true;
        button.title = "3D needs WebGL";
    }
    button.addEventListener("click", () => {
        state.view3d = !state.view3d;
        helpers.updateView3DUI(state);
        draw(); //also hides / restores the inset and the markers
    });

    const heightInput = document.getElementById("heightInput");
    heightInput.addEventListener("input", () => {
        const value = parseFloat(heightInput.value);
        if (!isNaN(value)) {
            state.height3d = Math.max(0, Math.min(100, value));
            helpers.updateHeightUI(heightInput, state);
            draw();
        }
    });

    //Reset camera: the terrain's camera, or the bulb's own (back to that bulb's default framing)
    document.getElementById("resetCamToggle").addEventListener("click", () => {
        if (isRaymarch(state.fractal)) {
            state.camBulb = { ...getFractal(state.fractal).defaults.cam };
            helpers.updateZoomUI(document.getElementById("zoomInput"), state);
        } else {
            state.cam3d = { ...DEFAULT_CAM };
        }
        draw();
    });
    helpers.updateHeightUI(heightInput, state);
    helpers.updateView3DUI(state);
}

//ORBIT: turn dragged pixels into camera angles (0.005 radians per pixel, about 0.3 degrees).
//Dragging right turns the camera around the terrain (or the bulb), dragging down lifts it higher
//up. A bulb type has its own camera (state.camBulb) with its own limits; the maths is the same.
function orbitBy(state, dxPixels, dyPixels) {
    const bulb = isRaymarch(state.fractal);
    const cam = bulb ? state.camBulb : state.cam3d;
    cam.yaw += dxPixels * 0.005;
    cam.pitch += dyPixels * 0.005;
    if (bulb) clampCam(cam, BULB_LIMITS);
    else clampCam(cam);
}

//PREVIEW CONTROLLER
//Remembers the last cursor / finger position (screen pixels) and redraws the inset for the
//complex point under it (on Julia-style types the inset ignores it and follows state.c). The position is kept in pixels, not as a complex number, so the
//inset keeps following the same spot of the screen when the view pans or zooms.
//Before the first move it uses the middle of the canvas.
function createPreview(canvas, state, renderPreview) {
    const checkbox = document.getElementById("previewToggle");
    let x = null, y = null;
    return {
        setPoint(sx, sy) {
            x = sx;
            y = sy;
        },
        //the complex point the inset is drawn for: the pinned point if there is one,
        //otherwise the one under the remembered position
        point() {
            if (state.pin) return state.pin;
            return screenToComplex(state, canvas, x ?? canvas.width / 2, y ?? canvas.height / 2);
        },
        //updates visibility, and redraws the inset when it is shown
        //(it runs even when the main image is paused)
        refresh() {
            if (helpers.updatePreviewVisibility(state, checkbox)) renderPreview(this.point());
        },
    };
}

function setupPreviewToggle(state, preview, canvas, draw) {
    document.getElementById("previewToggle").addEventListener("change", () => preview.refresh());
    //CLICK / TAP THE INSET to jump into exactly what it shows. Julia-style types ignore the
    //point (they jump to state.c); Mandelbrot-style types use point(): pinned, else last cursor.
    document.getElementById("previewBox").addEventListener("click", () => {
        jumpToPartner(canvas, state, preview.point(), draw);
    });
}

//JUMP (click or tap the inset)
//Only the inset triggers it (clicks on the main canvas pin or pause instead, see
//setupMouseTrack). Leaves the current type for its partner (see partner in fractals.js). Colours, power and
//the other settings are kept. Which way we go depends on the role of the pixel:
//  - Mandelbrot-style -> Julia: the clicked point p becomes the Julia constant c, which is
//    exactly the set shown in the inset.
//  - Julia-style -> Mandelbrot: the clicked point means nothing here (on a Julia the pixel
//    is only a start value). What matters is c, the constant that made this Julia set. So
//    the jump ignores p and uses state.c (when not paused, c already follows the cursor).
//    We centre the Mandelbrot view on c and leave a crosshair there ("where you came from").
const TAP_MOVE = 5; //px: moving less than this between down and up still counts as a click
function jumpToPartner(canvas, state, p, draw) {
    const current = FRACTALS[state.fractal];
    const target = current.partner;
    if (!target) return;
    state.pin = null; //a jump starts a new view, so any pin goes
    const from = {re: state.c.re, im: state.c.im}; //remembered before the defaults overwrite c
    const toMandelbrot = current.kind === "julia";
    state.fractal = target;
    applyFractalDefaults(state); //the partner's default view and zoom
    if (toMandelbrot) {
        //c is now the partner's z0 (normally 0); keep the default zoom, move the centre to `from`
        setViewCenter(state, from.re, from.im);
        state.markerPoint = from; //shown (and faded out) by flashMainMarker after the redraw
    } else {
        state.c = {re: p.re, im: p.im};  //the clicked point (overrides the default c)
        helpers.clearMainMarker(state);  //a new Julia set: the old "came from" marker is stale
    }
    helpers.updateFractalUI(document.getElementById("fractalSelect"), state);
    helpers.updateZoomUI(document.getElementById("zoomInput"), state);
    helpers.updateCUI(document.getElementById("cImInput"), document.getElementById("cReInput"), state);
    draw();
    if (toMandelbrot) helpers.flashMainMarker(state); //flash, then fade out the "c" marker
}

function setupButtons(canvas, state, draw) {
    //PAUSE BUTTON
    let pauseButton = document.getElementById("pauseToggle");
    document.addEventListener("keydown", (e) => {
        if (e.key.toLowerCase() === "p") {
        helpers.pause(state);
        helpers.updatePauseUI(pauseButton, state);
        console.log("P is pressed");
        }
    });
    if (pauseButton) {
        pauseButton.addEventListener("click", () => {
        helpers.pause(state);
        helpers.updatePauseUI(pauseButton, state);
        console.log("Pause button clicked");
        });
    }   

    //B&W BUTTON
    let bwButton = document.getElementById("bwToggle");
    if(bwButton){
        bwButton.addEventListener("click", () => {
            if(state.simple) {
                alert("Cannot toggle B&W in Simple mode. Please disable Simple mode first.");
                return;
            }
            state.bw = !state.bw;
            helpers.updateBWUI(bwButton);
            draw();
            console.log("BW button clicked");
        });
    }

    //DOWNLOAD BUTTON
    let downloadButton = document.getElementById("downloadToggle");
    if(downloadButton) {
        downloadButton.addEventListener("click", () => {
            const link = document.createElement("a");
            link.download = "fractal.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
            console.log("Download button clicked");
        });
    }

    //SAVE BUTTON
    let saveButton = document.getElementById("saveToggle")
    if(saveButton) {;
        saveButton.addEventListener("click", () => {
            saveSettings(state);
            console.log("Save button clicked");
        });
    }

    //SAVED SETTINGS
    let savedSelect = document.getElementById("savedSettingsSelect");
    if(savedSelect) {
        savedSelect.addEventListener("change", () => {
            loadSavedSettings(state, draw);
        });
    }

    //DELETE PRESET BUTTON
    let deletePresetButton = document.getElementById("deletePresetToggle");
    if(deletePresetButton) {
        deletePresetButton.addEventListener("click", () => {
            //Delete the option selected in the dropdown
            const select = document.getElementById("savedSettingsSelect");
            const selectedValue = select.value;
            if (!selectedValue) {
                alert("No preset selected to delete.");
                return;
            }

            //Remove from localStorage
            const saved = JSON.parse(localStorage.getItem("fractalPresets") || "{}");
            if (saved[selectedValue]) {
                delete saved[selectedValue];
                localStorage.setItem("fractalPresets", JSON.stringify(saved));
                populateSavedDropdown();
                select.value = ""; // Reset selection
                alert(`Preset "${selectedValue}" deleted.`);
                console.log(`Deleted preset: ${selectedValue}`);
            }
            console.log("Delete button clicked");
        });
    }

    //SIMPLE MODE BUTTON
    let simpleButton = document.getElementById("simpleToggle");
    if(simpleButton) {
        simpleButton.addEventListener("click", () => {
            state.simple = !state.simple;
            helpers.updatesimpleUI(simpleButton, state);
            draw();
            console.log("Simple button clicked");
        });
    }
}


function setupVariablesInputs (canvas, state, draw, hasBulb) {
    //Fractal type: options come from the registry, so new fractals show up automatically
    let fractalSelect = document.getElementById("fractalSelect");
    for (const key in FRACTALS) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = FRACTALS[key].name;
        fractalSelect.appendChild(option);
    }
    //the bulbs are raymarched on the GPU: without the bulb renderer (the CPU renderer) they are disabled
    helpers.setBulbOptionsEnabled(hasBulb);
    helpers.updateFractalUI(fractalSelect, state);
    fractalSelect.addEventListener("change", () => {
        const previous = state.fractal;
        state.fractal = fractalSelect.value;
        helpers.clearMainMarker(state); //choosing a type by hand clears the "came from" marker
        state.pin = null; //and the pinned preview point
        applyFractalDefaults(state, previous); //each type starts from a good view (a bulb also sets power, c z, camera)
        helpers.syncTypeUI(state); //zoom field, c, c z, power slider, 3D-only controls
        draw();
    });

    //Zoom input
    let zoomInput = document.getElementById("zoomInput");
    zoomInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            //the field holds a magnification (1 = the type's default view); 1e9 and 3.2×10^9 work
            const mag = parseMagnification(zoomInput.value);
            if (isNaN(mag)) {
                helpers.updateZoomUI(zoomInput, state); //garbage: change nothing, show the real value again
                return;
            }
            if (isRaymarch(state.fractal)) {
                //a bulb's "zoom" is the camera distance: magnification = default distance / distance
                state.camBulb.dist = getFractal(state.fractal).defaults.cam.dist / mag;
                clampCam(state.camBulb, BULB_LIMITS);
                helpers.updateZoomUI(zoomInput, state);
                draw();
                return;
            }
            //zoom around the middle of the screen (it stays fixed), within the allowed range
            const base = state.zoom / magnification(state); //the type's default zoom
            zoomAt(canvas, state, canvas.width / 2, canvas.height / 2, clampZoom(state, mag * base));
            helpers.updateZoomUI(zoomInput, state); //show the clamped / tidied value
            draw();
        }
    });

    //Constant c
    let cReInput = document.getElementById("cReInput");
    let cImInput = document.getElementById("cImInput");

    cReInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            let value = parseFloat(cReInput.value);
            if (!isNaN(value)) {
                state.c.re = value;
                draw();
            }
        }
    });
    cImInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            let value = parseFloat(cImInput.value);
            if (!isNaN(value)) {
                state.c.im = value;
                draw();
            }
        }
    });

    //Hue Base
    let hueBaseInput = document.getElementById("hueBaseInput");
    hueBaseInput.addEventListener("input", () => {
        if (state.simple) {
            alert("Please disable Simple mode first.");
            hueBaseInput.value = state.hueBase; // revert change
            return;
        }
        
        let value = parseFloat(hueBaseInput.value);
        if (!isNaN(value)) {
            value = Math.max(0, Math.min(1000, value)); //slider min is 0, so clamp to 0 (was 1)
            state.hueBase = value;
            helpers.updateHueBaseUI(hueBaseInput, state);
            draw();
        }
    });

    // Hue Speed
    let hueSpeedInput = document.getElementById("hueSpeedInput");
    hueSpeedInput.addEventListener("input", () => {
        if (state.simple) {
            alert("Please disable Simple mode first.");
            hueSpeedInput.value = state.hueSpeed; // revert THIS slider (used to wrongly revert hue base)
            return;
        }

        let value = parseFloat(hueSpeedInput.value);
        if (!isNaN(value)) {
            value = Math.max(1, Math.min(500, value));
            state.hueSpeed = value;
            helpers.updateHueSpeedUI(hueSpeedInput, state);
            draw();
        }
    });

    //Iterations (fractal depth) - works in every mode
    let iterInput = document.getElementById("iterInput");
    iterInput.addEventListener("input", () => {
        let value = parseFloat(iterInput.value);
        if (!isNaN(value)) {
            state.maxIter = sliderToIter(Math.max(0, Math.min(1000, value))); //slider 0..1000 -> 10..5000
            helpers.updateMaxIterUI(iterInput, state);
            draw();
        }
    });

    //Auto iterations: the count follows the zoom; the slider is disabled while it is on
    let iterAutoToggle = document.getElementById("iterAutoToggle");
    iterAutoToggle.addEventListener("change", () => {
        state.autoIter = iterAutoToggle.checked;
        helpers.applyAutoIter(state); //draw() would do it too, but the UI below needs the value now
        helpers.updateMaxIterUI(iterInput, state);
        draw();
    });

    //Smoothness (smooth colouring) - works in every mode, including Simple
    let smoothInput = document.getElementById("smoothInput");
    smoothInput.addEventListener("input", () => {
        let value = parseFloat(smoothInput.value);
        if (!isNaN(value)) {
            value = Math.max(0, Math.min(100, value));
            state.smoothness = value;
            helpers.updateSmoothnessUI(smoothInput, state);
            draw();
        }
    });

    //Power n of z -> z^n + k - works in every mode and for every fractal type
    let powerInput = document.getElementById("powerInput");
    powerInput.addEventListener("input", () => {
        let value = parseFloat(powerInput.value);
        if (!isNaN(value)) {
            value = Math.max(2, Math.min(8, value));
            state.power = value;
            helpers.updatePowerUI(powerInput, state);
            draw();
        }
    });

    //c z: the third component of the bulbs' constant (the slider is only shown for bulb types)
    let czInput = document.getElementById("czInput");
    czInput.addEventListener("input", () => {
        let value = parseFloat(czInput.value);
        if (!isNaN(value)) {
            state.cz = Math.max(-1.5, Math.min(1.5, value));
            helpers.updateCzUI(czInput, state);
            draw();
        }
    });
    helpers.updateCzUI(czInput, state);

    //Saturation - only affects color mode (B&W ignores it too, but we don't block there)
    let saturationInput = document.getElementById("saturationInput");
    saturationInput.addEventListener("input", () => {
        if (state.simple) {
            alert("Please disable Simple mode first.");
            saturationInput.value = state.saturation; // revert change
            return;
        }

        let value = parseFloat(saturationInput.value);
        if (!isNaN(value)) {
            value = Math.max(0, Math.min(100, value));
            state.saturation = value;
            helpers.updateSaturationUI(saturationInput, state);
            draw();
        }
    });

    //Lightness - same rules as saturation
    let lightnessInput = document.getElementById("lightnessInput");
    lightnessInput.addEventListener("input", () => {
        if (state.simple) {
            alert("Please disable Simple mode first.");
            lightnessInput.value = state.lightness; // revert change
            return;
        }

        let value = parseFloat(lightnessInput.value);
        if (!isNaN(value)) {
            value = Math.max(0, Math.min(100, value));
            state.lightness = value;
            helpers.updateLightnessUI(lightnessInput, state);
            draw();
        }
    });
}

function setupMouseTrack (canvas, state, draw, preview) {
    //Dragging
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0; //where the button went down, to tell a click from a drag
    let downY = 0;
    let panDrag = true; //3D only: this drag pans the region (Shift or right button) instead of orbiting
    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        panDrag = e.shiftKey || e.button === 2;
        lastX = e.clientX;
        lastY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
    });
    //A click (not a drag, i.e. a pan) on the canvas never changes the type; jumping is done by
    //clicking the inset. Why: the inset follows the cursor (Mandelbrot types) or c (Julia types),
    //so it would change on the way to it. A click therefore freezes what it shows first:
    //  - Mandelbrot kind: pin the inset at the clicked point p (a second click unpins)
    //  - Julia kind: toggle pause, which freezes c and so the inset's marker (same as the P key)
    canvas.addEventListener("click", (e) => {
        if (state.view3d || isRaymarch(state.fractal)) return; //3D: a click does nothing (no pin, no pause)
        if (e.pointerType === "touch") return; //touch has no hover drift: the finger sets the point
        if (Math.hypot(e.clientX - downX, e.clientY - downY) >= TAP_MOVE) return;
        if (FRACTALS[state.fractal].kind === "julia") {
            helpers.pause(state);
            helpers.updatePauseUI(document.getElementById("pauseToggle"), state);
        } else {
            state.pin = state.pin ? null : screenToComplex(state, canvas, e.clientX, e.clientY);
            preview.setPoint(e.clientX, e.clientY); //after unpinning the inset resumes from here
        }
        draw();
    });
    //Esc unpins
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.pin) {
            state.pin = null;
            draw();
        }
    });
    window.addEventListener("mouseup", () => {
        dragging = false;
    });
    //right-drag pans in 3D, so keep the browser's context menu away (2D keeps it)
    canvas.addEventListener("contextmenu", (e) => {
        if (state.view3d || isRaymarch(state.fractal)) e.preventDefault();
    });

    //Scrolling zoom
    let scrolling = false;
    let scrollTimeout;
    let zoomInput = document.getElementById("zoomInput");
    canvas.addEventListener("wheel", (e) => {
        scrolling = true;
        e.preventDefault();
        const zoomAmount = 1.1;
        const factor = e.deltaY < 0 ? zoomAmount : 1 / zoomAmount; //scroll up = zoom in
        if (isRaymarch(state.fractal)) {
            //a bulb: the wheel changes the camera DISTANCE (x1.1 per notch, scroll up = closer),
            //within the limits; that is the bulb's zoom
            state.camBulb.dist /= factor;
            clampCam(state.camBulb, BULB_LIMITS);
            helpers.updateZoomUI(zoomInput, state);
        } else if (state.view3d && e.ctrlKey) {
            //3D, Ctrl + wheel: move the CAMERA closer / farther (scroll up = closer)
            state.cam3d.dist /= factor;
            clampCam(state.cam3d);
        } else {
            //zoom toward the cursor: the point under it stays under it (zoomAt in view.js),
            //within the allowed magnification range. In 3D a screen position is not one point
            //of the plane, so the 3D wheel zooms the fractal region around the screen centre
            //(like the zoom box); Auto iterations follows in draw().
            const sx = state.view3d ? canvas.width / 2 : e.clientX;
            const sy = state.view3d ? canvas.height / 2 : e.clientY;
            zoomAt(canvas, state, sx, sy, clampZoom(state, state.zoom * factor));
            helpers.updateZoomUI(zoomInput, state);
        }
        draw();

        //Timer to count as "end of scroll"
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            console.log("Scroll ended");
            scrolling = false;
            draw();
        }, 150); // 150ms of no scroll 
    })

    //Change fractal constant according to mouse pos
    let cReInput = document.getElementById("cReInput"); //for updating the variable UI
    let cImInput = document.getElementById("cImInput");
    let drawScheduled = false;
    let previewScheduled = false;
    canvas.addEventListener("mousemove", (e) => {
        //the inset follows the cursor. Unpaused, the redraw below refreshes it; paused there is
        //no main redraw, so refresh the inset alone (batched per frame like the rest)
        preview.setPoint(e.clientX, e.clientY);
        if(state.pause && !dragging && !previewScheduled) {
            previewScheduled = true;
            requestAnimationFrame(() => {
                previewScheduled = false;
                preview.refresh();
            });
        }

        if(!state.pause && !drawScheduled && !dragging && !scrolling) {
            drawScheduled = true;
            requestAnimationFrame(() => { // only update every screen refresh rate
                state.c.re = (e.clientX - canvas.width / 2) / state.baseZoom;
                state.c.im = (e.clientY - canvas.height / 2) / state.baseZoom;
                helpers.updateCUI(cImInput, cReInput, state);
                draw();
                drawScheduled = false;
            });
        }

        if(dragging && !drawScheduled){
            drawScheduled = true;
            requestAnimationFrame(() => {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
    
                //3D: a plain drag orbits the camera; Shift / right drag pans the region like 2D.
                //A bulb has no region to pan: every drag orbits.
                if (isRaymarch(state.fractal) || (state.view3d && !panDrag)) orbitBy(state, dx, dy);
                else panBy(state, dx, dy);
    
                lastX = e.clientX;
                lastY = e.clientY;
    
                draw();
                drawScheduled = false;
            });
        }
    });

}

//TOUCH (phones and tablets)
//Pointer Events unify mouse, pen and touch. Each finger gets its own pointerId, so we can
//follow several fingers at once. We only handle pointerType "touch"; the mouse keeps using
//the mouse handlers above, so desktop behaviour is unchanged.
//One finger: moves c (or pans when paused). Two fingers: pinch zoom + pan together.
//A tap on the canvas does nothing; to jump, tap the inset (see setupPreviewToggle).
function setupTouch (canvas, state, draw, preview) {
    const touches = new Map(); //pointerId -> {x, y}: the fingers currently down (Map keeps insertion order)
    let prev = null; //reference from the previous frame: {x, y} for 1 finger, {x, y, dist} for 2 fingers
    let drawScheduled = false;
    const cReInput = document.getElementById("cReInput");
    const cImInput = document.getElementById("cImInput");
    const zoomInput = document.getElementById("zoomInput");

    //Summarise the active fingers (only the first two count): midpoint, and distance if there are two.
    //Returns null when no finger is down.
    function gesture() {
        const pts = [...touches.values()].slice(0, 2);
        if (pts.length === 0) return null;
        if (pts.length === 1) return {n: 1, x: pts[0].x, y: pts[0].y, dist: 0};
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return {n: 2, x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, dist};
    }

    //Forget the old reference so the next move starts from where the fingers are now (no jump)
    function resetReference() {
        const g = gesture();
        prev = g ? {n: g.n, x: g.x, y: g.y, dist: g.dist} : null;
    }

    function applyGesture() {
        const g = gesture();
        if (!g) return;
        //finger count changed since the last frame (or first move): just re-anchor, don't move anything
        if (!prev || prev.n !== g.n) {
            prev = g;
            return;
        }

        if (g.n === 1 && (state.view3d || isRaymarch(state.fractal))) {
            //3D (terrain or bulb): one finger orbits the camera. c does NOT follow the finger
            //here (unlike 2D), because the finger is needed for orbiting.
            orbitBy(state, g.x - prev.x, g.y - prev.y);
        } else if (g.n === 1) {
            preview.setPoint(g.x, g.y); //the inset follows the finger (draw() below refreshes it)
            if (!state.pause) {
                //same mapping as the mouse hover
                state.c.re = (g.x - canvas.width / 2) / state.baseZoom;
                state.c.im = (g.y - canvas.height / 2) / state.baseZoom;
                helpers.updateCUI(cImInput, cReInput, state);
            } else {
                //paused: drag to pan, like the mouse drag
                panBy(state, g.x - prev.x, g.y - prev.y);
            }
        } else if (isRaymarch(state.fractal)) {
            //a bulb: pinching changes the camera distance (spreading the fingers = closer)
            if (prev.dist > 0) {
                state.camBulb.dist /= g.dist / prev.dist;
                clampCam(state.camBulb, BULB_LIMITS);
                helpers.updateZoomUI(zoomInput, state);
            }
        } else {
            //Pinch: scale the zoom by how much the fingers spread (dist / prevDist).
            //Guard against prevDist === 0 (both fingers on the same pixel)
            if (prev.dist > 0) {
                zoomAt(canvas, state, g.x, g.y, clampZoom(state, state.zoom * (g.dist / prev.dist)));
                helpers.updateZoomUI(zoomInput, state);
            }
            //Also pan by how far the midpoint moved
            panBy(state, g.x - prev.x, g.y - prev.y);
        }
        prev = g;
        draw();
    }

    canvas.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return;
        e.preventDefault(); //stops the browser sending fake mouse events after the touch
        canvas.setPointerCapture(e.pointerId); //keep receiving this finger's events even if it leaves the canvas
        touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
        resetReference(); //finger count changed -> new reference
    });

    canvas.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
        touches.set(e.pointerId, {x: e.clientX, y: e.clientY}); //always store the latest position
        if (!drawScheduled) {
            drawScheduled = true;
            requestAnimationFrame(() => { //at most one update per screen refresh; uses the latest positions
                drawScheduled = false;
                applyGesture();
            });
        }
    });

    function endTouch(e) {
        if (e.pointerType !== "touch") return;
        touches.delete(e.pointerId);
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        resetReference(); //e.g. 2 fingers -> 1: the remaining finger becomes the new start point
    }
    canvas.addEventListener("pointerup", endTouch);
    canvas.addEventListener("pointercancel", endTouch);
}

function setupWindowResize (canvas, state, draw) {
    //Resize the canvas according to the window
    window.addEventListener("resize", () => {
        //the centre is stored directly (not as a pixel offset), so resizing keeps it in the middle
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        draw();
    });
}
