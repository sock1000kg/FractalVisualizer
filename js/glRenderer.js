// WebGL renderer: draws the fractal on the GPU with a fragment shader.
//
// Key WebGL ideas used here:
//  - A "context" (gl) is our handle to the GPU for one canvas.
//  - A "shader" is a small program that runs on the GPU. We use two:
//      vertex shader   -> runs once per corner of the shape we draw
//      fragment shader -> runs once per PIXEL; this is where the fractal maths lives
//    Together they form a "program".
//  - A "uniform" is a value we set from JavaScript that is the same for every
//    pixel (zoom, offset, colours...).
//  - To colour every pixel we draw a "full-screen quad": two triangles that
//    cover the whole canvas, so the fragment shader runs for each pixel.
//
// The shaders are WebGL 1 / GLSL ES 1.00 for maximum compatibility.
import {getFractal} from './fractals.js';

//Vertex shader: just passes the quad's corners straight through.
//aPos is already in clip space (-1..1 on both axes), so no maths needed.
const VERTEX_SRC = `
attribute vec2 aPos;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

//Builds the fragment shader source for one fractal type.
//init / step are the GLSL snippets from the FRACTALS registry.
function fragmentSource(glsl) {
    return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution; // canvas size in pixels
uniform vec2 uOffset;     // state.offsetX, state.offsetY
uniform float uZoom;
uniform vec2 uC;          // state.c as (re, im)
uniform int uMaxIter;
uniform float uHueBase;
uniform float uHueSpeed;
uniform float uSat;       // 0..100
uniform float uLight;     // 0..100
uniform int uMode;        // 0 = colour, 1 = black and white, 2 = simple

// Keep in sync with hslToRgb in utilities.js. Returns 0..255 values.
// (Same 6 hue branches; a hue outside 0..360 matches none, so r = g = b = 0,
// exactly like the CPU version.)
vec3 hslToRgb(float h, float s, float l) {
    s /= 100.0;
    l /= 100.0;

    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h / 60.0, 2.0) - 1.0));
    float m = l - c / 2.0;
    vec3 rgb = vec3(0.0);

    if (0.0 <= h && h < 60.0)         rgb = vec3(c, x, 0.0);
    else if (60.0 <= h && h < 120.0)  rgb = vec3(x, c, 0.0);
    else if (120.0 <= h && h < 180.0) rgb = vec3(0.0, c, x);
    else if (180.0 <= h && h < 240.0) rgb = vec3(0.0, x, c);
    else if (240.0 <= h && h < 300.0) rgb = vec3(x, 0.0, c);
    else if (300.0 <= h && h < 360.0) rgb = vec3(c, 0.0, x);

    // Math.round(v) for v >= 0 is floor(v + 0.5)
    return floor((rgb + m) * 255.0 + 0.5);
}

void main() {
    // gl_FragCoord is the pixel being shaded. Its y axis points UP and pixel
    // centres sit at .5, while the CPU renderer counts y DOWN from the top
    // with whole numbers, so convert to match it exactly.
    float px = floor(gl_FragCoord.x);
    float py = uResolution.y - 1.0 - floor(gl_FragCoord.y);
    vec2 p = (vec2(px, py) + uOffset) / uZoom; // the pixel as a complex number

    vec2 z;
    vec2 k;
    ${glsl.init}

    // GLSL ES 1.00 loops need a constant bound, so loop to 500 and break out
    // early. 500 is the iterations slider's maximum (index.html): update it
    // here if that max changes.
    // The bailout test comes BEFORE the step, like the CPU's while loop.
    int iter = 0;
    for (int i = 0; i < 500; i++) {
        if (i >= uMaxIter) break;
        if (dot(z, z) >= 4.0) break;
        ${glsl.step}
        iter++;
    }

    // Keep in sync with colors.js (same modes, same priority: simple > bw > colour).
    float maxIter = float(uMaxIter);
    float fi = float(iter);
    bool inside = (iter == uMaxIter);
    vec3 rgb;

    if (uMode == 2) {
        // simple: greyscale, inside the set is black.
        // The tiny 0.001 stops a GPU division like 2.9999999 flooring to 2.
        float v = inside ? 0.0 : 255.0 - floor(fi * 255.0 / maxIter + 0.001);
        rgb = vec3(v);
    } else if (uMode == 1) {
        // black and white
        float shade = inside ? uHueBase : mod(uHueBase + fi * uHueSpeed, 256.0);
        rgb = vec3(255.0 - floor(shade)); // can go below 0 (hueBase up to 1000)
    } else {
        // colour
        float hue = inside ? uHueBase : mod(uHueBase + fi * uHueSpeed, 360.0);
        rgb = hslToRgb(hue, uSat, uLight);
    }

    // The CPU's Uint8ClampedArray clamps to 0..255, so do the same here
    rgb = clamp(rgb, 0.0, 255.0);
    gl_FragColor = vec4(rgb / 255.0, 1.0);
}
`;
}

//Compiles one shader and throws (after logging) if it fails
function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        console.error("Shader compile error:", log);
        throw new Error("Shader compile error: " + log);
    }
    return shader;
}

//Links a vertex + fragment shader into a program and throws if it fails
function link(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        console.error("Program link error:", log);
        throw new Error("Program link error: " + log);
    }
    return program;
}

//Sets up WebGL on the canvas and returns draw(state)
export function createGLRenderer(canvas, gl) {
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!hp || hp.precision === 0) {
        console.warn("highp floats are not supported in fragment shaders; deep zooms may look blocky");
    }

    const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);

    //Full-screen quad: two triangles covering clip space (-1..1).
    //One static buffer, created once and reused for every draw.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,   1, -1,   -1, 1,
        -1,  1,   1, -1,    1, 1,
    ]), gl.STATIC_DRAW);

    //Compiled programs, one per fractal key, built lazily on first use.
    //Each entry is { program, uniforms, aPos }.
    const cache = {};

    function getProgram(key) {
        if (cache[key]) return cache[key];
        const fractal = getFractal(key);
        const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(fractal.glsl));
        const program = link(gl, vertexShader, fragmentShader);

        //look up where each uniform lives once, not on every draw
        const uniforms = {};
        for (const name of ["uResolution", "uOffset", "uZoom", "uC", "uMaxIter",
                            "uHueBase", "uHueSpeed", "uSat", "uLight", "uMode"]) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        cache[key] = { program, uniforms, aPos: gl.getAttribLocation(program, "aPos") };
        return cache[key];
    }

    //Compile the default type now so a shader error is caught at startup
    //(main.js then falls back to the CPU) rather than on the first interaction.
    getProgram("julia");

    return function draw(state) {
        //the drawing area must match the canvas size, so resizes work
        gl.viewport(0, 0, canvas.width, canvas.height);

        const p = getProgram(state.fractal);
        gl.useProgram(p.program);

        //feed the quad's corners to the vertex shader's aPos attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(p.aPos);
        gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0);

        //same priority as colors.js: simple > bw > colour
        const mode = state.simple ? 2 : (state.bw ? 1 : 0);

        const u = p.uniforms;
        gl.uniform2f(u.uResolution, canvas.width, canvas.height);
        gl.uniform2f(u.uOffset, state.offsetX, state.offsetY);
        gl.uniform1f(u.uZoom, state.zoom);
        gl.uniform2f(u.uC, state.c.re, state.c.im);
        gl.uniform1i(u.uMaxIter, state.maxIter);
        gl.uniform1f(u.uHueBase, state.hueBase);
        gl.uniform1f(u.uHueSpeed, state.hueSpeed);
        gl.uniform1f(u.uSat, state.saturation);
        gl.uniform1f(u.uLight, state.lightness);
        gl.uniform1i(u.uMode, mode);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
}
