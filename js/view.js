//View helpers: convert between the pan/zoom state and the complex plane.
//
//draw.js maps a pixel to the complex plane with
//    re = (px + state.offsetX) / state.zoom
//    im = (py + state.offsetY) / state.zoom
//so the point under the middle of the canvas is
//    ((width/2 + offsetX) / zoom, (height/2 + offsetY) / zoom)
//Changing zoom without touching offset moves that point, which is why zooming
//used to drift unless the view was centred on (0, 0). These helpers let us
//read the centre, change zoom/size, then put the centre back.
import {getFractal} from './fractals.js';

//complex point at the middle of the canvas
export function getViewCenter(canvas, state) {
    return {
        re: (canvas.width / 2 + state.offsetX) / state.zoom,
        im: (canvas.height / 2 + state.offsetY) / state.zoom,
    };
}

//the inverse: choose offsets so (re, im) sits in the middle of the canvas
export function setViewCenter(canvas, state, re, im) {
    state.offsetX = re * state.zoom - canvas.width / 2;
    state.offsetY = im * state.zoom - canvas.height / 2;
}

//jump to the selected fractal's default c, zoom and centre
export function applyFractalDefaults(canvas, state) {
    const d = getFractal(state.fractal).defaults;
    state.c = { re: d.c.re, im: d.c.im }; //new object so the registry's defaults are never mutated
    state.zoom = d.zoom; //zoom first: setViewCenter depends on it
    setViewCenter(canvas, state, d.center.re, d.center.im);
}

//zoom to newZoom while keeping the complex point under screen pixel (sx, sy) fixed.
//Used by the pinch gesture: the point between the fingers stays between the fingers.
//  1. find the complex number currently under the pixel:  re = (sx + offsetX) / zoom
//  2. change the zoom
//  3. pick the offset that puts the SAME number back under the pixel:
//         (sx + offsetX') / newZoom = re   =>   offsetX' = re * newZoom - sx
//(getViewCenter/setViewCenter do the same thing for the fixed point (width/2, height/2))
export function zoomAt(canvas, state, sx, sy, newZoom) {
    const re = (sx + state.offsetX) / state.zoom;
    const im = (sy + state.offsetY) / state.zoom;
    state.zoom = newZoom;
    state.offsetX = re * newZoom - sx;
    state.offsetY = im * newZoom - sy;
}
