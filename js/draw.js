import {getFractal} from './fractals.js';
import {colorize} from './colors.js';

export function draw(canvas, state){
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(canvas.width, canvas.height);
    const data = img.data;
    //read these once per draw instead of once per pixel
    const maxIter = state.maxIter;
    const fractal = getFractal(state.fractal);
    //one reusable result object per draw, so no object is allocated per pixel
    const out = {iter: 0, smooth: 0};
    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;

    //rows outside, columns inside: the image buffer is laid out row by row,
    //so this writes memory sequentially, which is friendlier to the CPU cache.
    //Each pixel is independent, so the result is identical to the old loop order.
    for(let py = 0; py < canvas.height; py++){
        for(let px = 0; px < canvas.width; px++){
            //zx, zy are the coordinates in the complex plane (the mapping from view.js):
            //the centre plus a small distance. A double keeps ~16 digits, so this stays
            //accurate up to a zoom of about 1e13, where neighbouring pixels still differ.
            let zx = state.center.re + (px - halfW) / state.zoom;
            let zy = state.center.im + (py - halfH) / state.zoom;

            fractal.iterate(zx, zy, state, maxIter, out);
            let [r, g, b] = colorize(out, maxIter, state);

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
