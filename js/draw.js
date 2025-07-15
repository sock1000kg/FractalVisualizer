import {julia, hslToRgb} from './utilities.js';

export function draw(canvas, state){
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(canvas.width, canvas.height);
    const data = img.data;

    for(let px = 0; px < canvas.width; px++){
        for(let py = 0; py < canvas.height; py++){
            let zx = (px + state.offsetX) / state.zoom;
            let zy = (py + state.offsetY) / state.zoom;
            const localMaxIter = state.bw ? 150 : 100;

            let iter = julia(zx, zy, state.c, localMaxIter);
            //BLACK AND WHITE MODE
            if(state.bw){
                // SIMPLE BW: let color = iter === localMaxIter ? 0 : 255 - Math.floor(iter * 255 / localMaxIter);
                let shade;
                if (iter === localMaxIter) {
                    shade = state.hueBase; // Center shade
                } 
                else {
                    shade = (state.hueBase + iter * state.hueSpeed) % 256;
                }
                let color = 255 - Math.floor(shade); 

                let i = (py * canvas.width + px) * 4;
                data[i] = color; //R
                data[i+1] = color; //G
                data[i+2] = color; //B
                data[i+3] = 255;
            }

            //COLOR MODE
            else{
                let hue;
                if(iter === localMaxIter) hue = state.hueBase; //Center hue
                else hue = (state.hueBase + iter * state.hueSpeed) % 360;

                let rgb = hslToRgb(hue, 70, 50);

                let i = (py * canvas.width + px) * 4;
                data[i] = rgb[0]; //R
                data[i+1] = rgb[1]; //G
                data[i+2] = rgb[2]; //B
                data[i+3] = 255;
            }
        }
    }

    ctx.putImageData(img, 0, 0);
    // console.log("drawn succesfully");
}

