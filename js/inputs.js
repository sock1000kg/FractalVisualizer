import * as helpers from './helpers.js';
import {saveSettings, populateSavedDropdown, loadSavedSettings} from './save.js';

export function setupInputs(canvas, state, draw){
    setupButtons(canvas, state, draw);
    setupMouseTrack(canvas, state, draw);
    setupVariablesInputs(state, draw);
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


function setupVariablesInputs (state, draw) {
    //Zoom input
    let zoomInput = document.getElementById("zoomInput");
    zoomInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            let zoomValue = parseFloat(zoomInput.value);
            if (isNaN(zoomValue)) return;
            
            zoomValue = Math.max(50, Math.min(1500, zoomValue));
            state.zoom = zoomValue;
            if(zoomValue < 50) state.zoom = 50;
            if(zoomValue > 1500) state.zoom = 1500;
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
    hueBaseInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            if (state.simple) {
                alert("Please disable Simple mode first.");
            }
            
            let value = parseFloat(hueBaseInput.value);
            if (!isNaN(value)) {
                value = Math.max(1, Math.min(1000, value));
                state.hueBase = value;
                helpers.updateHueBaseUI(hueBaseInput, state);
                draw();
            }
        }
    });

    // Hue Speed
    let hueSpeedInput = document.getElementById("hueSpeedInput");
    hueSpeedInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            if (state.simple) {
                alert("Please disable Simple mode first."); 
            }
            
            let value = parseFloat(hueSpeedInput.value);
            if (!isNaN(value)) {
                value = Math.max(1, Math.min(500, value));
                state.hueSpeed = value;
                helpers.updateHueSpeedUI(hueSpeedInput, state);
                draw();
            }
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
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        state.offsetX = -canvas.width / 2;
        state.offsetY = -canvas.height / 2;
        draw();
    });
}
