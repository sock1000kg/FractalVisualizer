// Pure colouring: turns an iteration result into an [r, g, b] colour.
// No DOM or canvas access on purpose, so it stays easy to test and to
// mirror later in a WebGL shader.
// Keep in sync with the colour code in glRenderer.js (the GLSL port of this file
// and hslToRgb in utilities.js), including the smooth-colour blend t in colorize().
import {hslToRgb} from './utilities.js';

//SIMPLE MODE: plain greyscale, points inside the set are black
//t is the (possibly fractional) iteration value, see colorize()
function simpleColor(iter, t, maxIter){
    let color = iter === maxIter ? 0 : 255 - Math.floor(t * 255 / maxIter);
    return [color, color, color];
}

//BLACK AND WHITE MODE
function bwColor(iter, t, maxIter, state){
    let shade;
    if (iter === maxIter) {
        shade = state.hueBase; // Center shade
    } 
    else {
        shade = (state.hueBase + t * state.hueSpeed) % 256;
    }
    let color = 255 - Math.floor(shade); 
    return [color, color, color];
}

//COLOR MODE
function hslColor(iter, t, maxIter, state){
    let hue;
    if(iter === maxIter) hue = state.hueBase; //Center hue
    else hue = (state.hueBase + t * state.hueSpeed) % 360;

    //saturation/lightness come from the sliders (defaults 70/50 match the old hardcoded look)
    return hslToRgb(hue, state.saturation, state.lightness);
}

//Picks the colouring mode. Priority is simple > bw > color, same as before the refactor.
//result is the object filled by fractal.iterate: result.iter (integer) and result.smooth.
//Escaped points are coloured by t, a blend between the banded integer iter and the
//smooth value (see smoothValue in fractals.js): s = 0 -> t = iter (bands), s = 1 -> t = smooth.
//Points inside the set (iter === maxIter) ignore t and use the "inside" colours.
export function colorize(result, maxIter, state){
    const iter = result.iter;
    const s = state.smoothness / 100;
    const t = iter + s * (result.smooth - iter);
    if(state.simple) return simpleColor(iter, t, maxIter);
    if(state.bw) return bwColor(iter, t, maxIter, state);
    return hslColor(iter, t, maxIter, state);
}
