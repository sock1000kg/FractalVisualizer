// Pure colouring: turns an iteration count into an [r, g, b] colour.
// No DOM or canvas access on purpose, so it stays easy to test and to
// mirror later in a WebGL shader.
import {hslToRgb} from './utilities.js';

//SIMPLE MODE: plain greyscale, points inside the set are black
function simpleColor(iter, maxIter){
    let color = iter === maxIter ? 0 : 255 - Math.floor(iter * 255 / maxIter);
    return [color, color, color];
}

//BLACK AND WHITE MODE
function bwColor(iter, maxIter, state){
    let shade;
    if (iter === maxIter) {
        shade = state.hueBase; // Center shade
    } 
    else {
        shade = (state.hueBase + iter * state.hueSpeed) % 256;
    }
    let color = 255 - Math.floor(shade); 
    return [color, color, color];
}

//COLOR MODE
function hslColor(iter, maxIter, state){
    let hue;
    if(iter === maxIter) hue = state.hueBase; //Center hue
    else hue = (state.hueBase + iter * state.hueSpeed) % 360;

    //saturation/lightness come from the sliders (defaults 70/50 match the old hardcoded look)
    return hslToRgb(hue, state.saturation, state.lightness);
}

//Picks the colouring mode. Priority is simple > bw > color, same as before the refactor.
export function colorize(iter, maxIter, state){
    if(state.simple) return simpleColor(iter, maxIter);
    if(state.bw) return bwColor(iter, maxIter, state);
    return hslColor(iter, maxIter, state);
}
