import {getFractal} from './fractals.js';
import {colorize} from './colors.js';

export function draw(canvas, state){
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(canvas.width, canvas.height);
    const data = img.data;
    //read these once per draw instead of once per pixel
    const maxIter = state.maxIter;
    const fractal = getFractal(state.fractal);

    //rows outside, columns inside: the image buffer is laid out row by row,
    //so this writes memory sequentially, which is friendlier to the CPU cache.
    //Each pixel is independent, so the result is identical to the old loop order.
    for(let py = 0; py < canvas.height; py++){
        for(let px = 0; px < canvas.width; px++){
            //zx, zy are the coordinates in the complex plane
            let zx = (px + state.offsetX) / state.zoom;
            let zy = (py + state.offsetY) / state.zoom;

            let iter = fractal.iterate(zx, zy, state, maxIter);
            let [r, g, b] = colorize(iter, maxIter, state);

            //single RGBA write for every mode
            let i = (py * canvas.width + px) * 4;
            data[i] = r;
            data[i+1] = g;
            data[i+2] = b;
            data[i+3] = 255;
        }
    }

    ctx.putImageData(img, 0, 0);
    // console.log("drawn succesfully");
}
