import * as helpers from './helpers.js';
import {FRACTALS} from './fractals.js';
import {getViewCenter, setViewCenter, applyFractalDefaults} from './view.js';
import {saveSettings, populateSavedDropdown, loadSavedSettings} from './save.js';

export function setupInputs(canvas, state, draw){
    setupButtons(canvas, state, draw);
    setupMouseTrack(canvas, state, draw);
    setupVariablesInputs(canvas, state, draw);
    setupWindowResize(canvas, state, draw);
    populateSavedDropdown();
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

function setupMouseTrack (canvas, state, draw) {
    //Dragging
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
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
    canvas.addEventListener("mousemove", (e) => {
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
