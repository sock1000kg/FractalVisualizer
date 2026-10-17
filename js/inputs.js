import * as helpers from './helpers.js';
import {FRACTALS} from './fractals.js';
import {getViewCenter, setViewCenter, applyFractalDefaults, zoomAt, screenToComplex} from './view.js';
import {saveSettings, populateSavedDropdown, loadSavedSettings} from './save.js';

//api = {render, renderPreview}: render() draws the main canvas, renderPreview(p) draws the
//inset (the partner of the current type; p is the complex point under the cursor, which
//only matters on Mandelbrot-style types).
export function setupInputs(canvas, state, api){
    const preview = createPreview(canvas, state, api.renderPreview);
    //Every redraw of the main canvas also refreshes the inset, the formula line and the
    //"c" marker, so a slider, mode, preset or type change is picked up by all of them
    //without touching each handler.
    const draw = () => {
        api.render();
        helpers.updateFormula(state);
        helpers.updateMainMarker(state);
        preview.refresh();
    };
    setupButtons(canvas, state, draw);
    setupMouseTrack(canvas, state, draw, preview);
    setupTouch(canvas, state, draw, preview);
    setupVariablesInputs(canvas, state, draw);
    setupPreviewToggle(state, preview);
    setupWindowResize(canvas, state, draw);
    populateSavedDropdown();
    //first paint of the pieces that normally refresh on every draw
    helpers.updateFormula(state);
    preview.refresh();
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
        //the complex point under the remembered position
        point() {
            return screenToComplex(state, x ?? canvas.width / 2, y ?? canvas.height / 2);
        },
        //updates visibility, and redraws the inset when it is shown
        //(it runs even when the main image is paused)
        refresh() {
            if (helpers.updatePreviewVisibility(state, checkbox)) renderPreview(this.point());
        },
    };
}

function setupPreviewToggle(state, preview) {
    document.getElementById("previewToggle").addEventListener("change", () => preview.refresh());
}

//CLICK / TAP TO JUMP
//Leaves the current type for its partner (see partner in fractals.js). Colours, power and
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
    const from = {re: state.c.re, im: state.c.im}; //remembered before the defaults overwrite c
    const toMandelbrot = current.kind === "julia";
    state.fractal = target;
    applyFractalDefaults(canvas, state); //the partner's default view and zoom
    if (toMandelbrot) {
        //c is now the partner's z0 (normally 0); keep the default zoom, move the centre to `from`
        setViewCenter(canvas, state, from.re, from.im);
        state.markerPoint = from;
    } else {
        state.c = {re: p.re, im: p.im};  //the clicked point (overrides the default c)
        state.markerPoint = null;        //a new Julia set: the old "came from" marker is stale
    }
    helpers.updateFractalUI(document.getElementById("fractalSelect"), state);
    helpers.updateZoomUI(document.getElementById("zoomInput"), state);
    helpers.updateCUI(document.getElementById("cImInput"), document.getElementById("cReInput"), state);
    draw();
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


function setupVariablesInputs (canvas, state, draw) {
    //Fractal type: options come from the registry, so new fractals show up automatically
    let fractalSelect = document.getElementById("fractalSelect");
    for (const key in FRACTALS) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = FRACTALS[key].name;
        fractalSelect.appendChild(option);
    }
    helpers.updateFractalUI(fractalSelect, state);
    fractalSelect.addEventListener("change", () => {
        state.fractal = fractalSelect.value;
        state.markerPoint = null; //choosing a type by hand clears the "came from" marker
        applyFractalDefaults(canvas, state); //each type starts from a good view
        helpers.updateZoomUI(document.getElementById("zoomInput"), state);
        helpers.updateCUI(document.getElementById("cImInput"), document.getElementById("cReInput"), state);
        draw();
    });

    //Zoom input
    let zoomInput = document.getElementById("zoomInput");
    zoomInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            let zoomValue = parseFloat(zoomInput.value);
            if (isNaN(zoomValue)) return;
            
            zoomValue = Math.max(50, Math.min(1500, zoomValue));
            //keep the point at the screen centre fixed while the zoom changes
            const center = getViewCenter(canvas, state);
            state.zoom = zoomValue;
            if(zoomValue < 50) state.zoom = 50;
            if(zoomValue > 1500) state.zoom = 1500;
            setViewCenter(canvas, state, center.re, center.im);
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
            value = Math.max(10, Math.min(500, value)); //same range as the slider
            state.maxIter = value;
            helpers.updateMaxIterUI(iterInput, state);
            draw();
        }
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
    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
    });
    //click to jump to the partner type (a drag, i.e. a pan, must not jump)
    canvas.addEventListener("click", (e) => {
        if (e.pointerType === "touch") return; //touch taps are handled in setupTouch
        if (Math.hypot(e.clientX - downX, e.clientY - downY) >= TAP_MOVE) return;
        jumpToPartner(canvas, state, screenToComplex(state, e.clientX, e.clientY), draw);
    });
    window.addEventListener("mouseup", () => {
        dragging = false;
    });

    //Scrolling zoom
    let scrolling = false;
    let scrollTimeout;
    let zoomInput = document.getElementById("zoomInput");
    canvas.addEventListener("wheel", (e) => {
        scrolling = true;
        e.preventDefault();
        const zoomAmount = 1.1;
        //keep the point at the screen centre fixed while the zoom changes
        const center = getViewCenter(canvas, state);
        if(e.deltaY < 0) {
            //Zoom in
            state.zoom *= zoomAmount;
            helpers.updateZoomUI(zoomInput, state);
        }
        else {
            //Zoom out
            state.zoom /= zoomAmount;
            helpers.updateZoomUI(zoomInput, state);
        }
        setViewCenter(canvas, state, center.re, center.im);
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
    
                state.offsetX -= dx;
                state.offsetY -= dy;
    
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
function setupTouch (canvas, state, draw, preview) {
    //TAP detection: a tap is one finger, moved < TAP_MOVE px, lifted within TAP_TIME ms, with
    //no second finger at any point. tapOk goes false as soon as one of those is broken.
    const TAP_TIME = 300;
    let tap = null; //{x, y, t, ok} for the current touch sequence
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

        if (g.n === 1) {
            preview.setPoint(g.x, g.y); //the inset follows the finger (draw() below refreshes it)
            if (!state.pause) {
                //same mapping as the mouse hover
                state.c.re = (g.x - canvas.width / 2) / state.baseZoom;
                state.c.im = (g.y - canvas.height / 2) / state.baseZoom;
                helpers.updateCUI(cImInput, cReInput, state);
            } else {
                //paused: drag to pan, like the mouse drag
                state.offsetX -= g.x - prev.x;
                state.offsetY -= g.y - prev.y;
            }
        } else {
            //Pinch: scale the zoom by how much the fingers spread (dist / prevDist).
            //Guard against prevDist === 0 (both fingers on the same pixel)
            if (prev.dist > 0) {
                zoomAt(canvas, state, g.x, g.y, state.zoom * (g.dist / prev.dist));
                helpers.updateZoomUI(zoomInput, state);
            }
            //Also pan by how far the midpoint moved
            state.offsetX -= g.x - prev.x;
            state.offsetY -= g.y - prev.y;
        }
        prev = g;
        draw();
    }

    canvas.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return;
        e.preventDefault(); //stops the browser sending fake mouse events after the touch
        canvas.setPointerCapture(e.pointerId); //keep receiving this finger's events even if it leaves the canvas
        touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
        if (touches.size === 1) tap = {x: e.clientX, y: e.clientY, t: performance.now(), ok: true};
        else if (tap) tap.ok = false; //a second finger: this is a pinch, never a tap
        resetReference(); //finger count changed -> new reference
    });

    canvas.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
        touches.set(e.pointerId, {x: e.clientX, y: e.clientY}); //always store the latest position
        if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= TAP_MOVE) tap.ok = false;
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
        //last finger lifted: was it a quick, still, single-finger tap? then jump (pointercancel never taps)
        if (touches.size === 0 && tap) {
            const isTap = tap.ok && e.type === "pointerup" && performance.now() - tap.t < TAP_TIME;
            const {x, y} = tap;
            tap = null;
            if (isTap) jumpToPartner(canvas, state, screenToComplex(state, x, y), draw);
        }
    }
    canvas.addEventListener("pointerup", endTouch);
    canvas.addEventListener("pointercancel", endTouch);
}

function setupWindowResize (canvas, state, draw) {
    //Resize the canvas according to the window
    window.addEventListener("resize", () => {
        //remember the centre, resize, then restore it so the view doesn't jump
        const center = getViewCenter(canvas, state);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        setViewCenter(canvas, state, center.re, center.im);
        draw();
    });
}
