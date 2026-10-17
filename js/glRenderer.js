// WebGL renderer: draws the fractal on the GPU with a fragment shader.
//
// Key WebGL ideas used here:
//  - A "context" (gl) is our handle to the GPU for one canvas.
//  - A "shader" is a small program that runs on the GPU. We use two:
//      vertex shader   -> runs once per corner of the shape we draw
//      fragment shader -> runs once per PIXEL; this is where the fractal maths lives
//    Together they form a "program".
//  - A "uniform" is a value we set from JavaScript that is the same for every
//    pixel (zoom, centre, colours...).
//  - To colour every pixel we draw a "full-screen quad": two triangles that
//    cover the whole canvas, so the fragment shader runs for each pixel.
//
// The shaders are WebGL 1 / GLSL ES 1.00 for maximum compatibility.
import {getFractal} from './fractals.js';
import {magnification} from './view.js';

//Vertex shader: just passes the quad's corners straight through.
//aPos is already in clip space (-1..1 on both axes), so no maths needed.
const VERTEX_SRC = `
attribute vec2 aPos;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

//SHARED SHADER PIECES. There are two fragment shaders per fractal: the FLOAT shader (fast,
//about 7 digits, used for shallow zoom) and the DOUBLE-FLOAT shader ("dd", about 14 digits,
//used for deep zoom; see the big comment above DD_LIB). Everything that does not depend on
//the number format is written once here and pasted into both.

//precision line + the uniforms both shaders share (the colour settings and the power)
const COMMON_HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution; // canvas size in pixels
uniform float uHueBase;
uniform float uHueSpeed;
uniform float uSat;       // 0..100
uniform float uLight;     // 0..100
uniform int uMode;        // 0 = colour, 1 = black and white, 2 = simple
uniform float uSmooth;    // state.smoothness / 100: 0 = banded, 1 = fully smooth
uniform float uPower;     // state.power: the n in z -> z^n + k
`;

//helper functions both shaders use: the smooth-colouring constants, cpow and hslToRgb
const COMMON_FUNCS = `
// Extra steps run after a point escapes (see smoothValue in fractals.js).
// At most 3 are run; they also stop early when |z| gets too big (see SAFE_LOG2).
#define SMOOTH_EXTRA 3
// A step must not make |z|^2 overflow, so we stop when log2|z| * n > SAFE_LOG2
// (log2 of the |z| the next step would give). highp floats reach about 1e38 = 2^126, so
// |z|^2 < 2^120 is safe with 60. mediump overflows past about 65000 = 2^16, so
// |z|^2 < 2^14 needs 7.
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define SAFE_LOG2 60.0
#else
#define SAFE_LOG2 7.0
#endif

// z^n for a real n (same as power() in fractals.js; read the polar-form and seam
// explanation there). z = r*(cos t + i*sin t) gives z^n = r^n*(cos nt + i*sin nt),
// with r^n = (r^2)^(n/2). Fractional n shows a straight seam on the negative real axis.
vec2 cpow(vec2 z, float n) {
    if (n == 2.0) return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y); // fast path, as before
    float r2 = dot(z, z);
    // atan(0.0, 0.0) is undefined in GLSL, and Mandelbrot starts at z = 0
    if (r2 == 0.0) return vec2(0.0);
    float rn = pow(r2, 0.5 * n);
    float nt = n * atan(z.y, z.x); // atan(y, x) is the two-argument atan2
    return rn * vec2(cos(nt), sin(nt));
}

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
`;

//Everything AFTER the escape loop: smooth colouring, then the colour modes. It needs the
//variables iter (int), z and k (vec2, plain floats) to exist. `step` is the fractal's float
//step snippet (once a point has escaped |z| > 2, so float precision is enough for the extra
//steps even in the deep shader).
function tailSource(step) {
    return `
    // SMOOTH COLOURING (full explanation at smoothValue in fractals.js).
    // The integer iter makes colour bands. For escaped points we run a few more
    // steps so |z| is large, then nu = iter + extraDone - ln(log2|z|) / ln n is a
    // fractional iteration count (the inner ln 2 comes from the bailout radius 2, the
    // outer log is base n because each step multiplies ln|z| by n).
    // uSmooth blends: t = iter (bands) .. nu (smooth).
    float fi = float(iter);
    float t = fi;
    bool inside = (iter == uMaxIter);
    if (!inside) {
        int extraDone = 0;
        // constant loop bound, as GLSL ES 1.00 requires
        for (int e = 0; e < SMOOTH_EXTRA; e++) {
            // stop before |z| overflows the float range
            float lz = 0.5 * log(dot(z, z)) / 0.6931471805599453;
            if (lz * uPower > SAFE_LOG2) break;
            ${step}
            extraDone++;
        }
        // ln|z| / ln 2 = log2|z|; max(.., 1.0) keeps log away from values <= 0 (NaN)
        float log2z = max(0.5 * log(dot(z, z)) / 0.6931471805599453, 1.0);
        float nu = max(fi + float(extraDone) - log(log2z) / log(uPower), 0.0);
        t = fi + uSmooth * (nu - fi);
    }

    // Keep in sync with colors.js (same modes, same priority: simple > bw > colour).
    float maxIter = float(uMaxIter);
    vec3 rgb;

    if (uMode == 2) {
        // simple: greyscale, inside the set is black.
        // The tiny 0.001 stops a GPU division like 2.9999999 flooring to 2.
        float v = inside ? 0.0 : 255.0 - floor(t * 255.0 / maxIter + 0.001);
        rgb = vec3(v);
    } else if (uMode == 1) {
        // black and white
        float shade = inside ? uHueBase : mod(uHueBase + t * uHueSpeed, 256.0);
        rgb = vec3(255.0 - floor(shade)); // can go below 0 (hueBase up to 1000)
    } else {
        // colour
        float hue = inside ? uHueBase : mod(uHueBase + t * uHueSpeed, 360.0);
        rgb = hslToRgb(hue, uSat, uLight);
    }

    // The CPU's Uint8ClampedArray clamps to 0..255, so do the same here
    rgb = clamp(rgb, 0.0, 255.0);
    gl_FragColor = vec4(rgb / 255.0, 1.0);
}
`;
}

//Builds the FLOAT fragment shader source for one fractal type.
//init / step are the GLSL snippets from the FRACTALS registry.
function fragmentSource(glsl) {
    return COMMON_HEAD + `
// The view centre (state.center) as (re, im). NOTE: this is a 32-bit float (~7 digits), so
// past a magnification of about 1e5 neighbouring pixels get the same centre-relative value
// and the image turns blocky. That is why deep zoom uses the double-float shader instead.
uniform vec2 uCenter;
uniform float uZoom;
uniform vec2 uC;          // state.c as (re, im)
` + COMMON_FUNCS + `
void main() {
    // gl_FragCoord is the pixel being shaded. Its y axis points UP and pixel
    // centres sit at .5, while the CPU renderer counts y DOWN from the top
    // with whole numbers, so convert to match it exactly.
    float px = floor(gl_FragCoord.x);
    float py = uResolution.y - 1.0 - floor(gl_FragCoord.y);
    // The pixel as a complex number: the centre plus a SMALL distance (same formula as
    // view.js). The distance (pixel - screen centre) / zoom stays accurate even when deep.
    vec2 p = uCenter + (vec2(px, py) - 0.5 * uResolution) / uZoom;

    vec2 z;
    vec2 k;
    ${glsl.init}

    // GLSL ES 1.00 loops need a constant bound, so loop to 5000 and break out
    // early. 5000 is the iterations maximum (MAX_ITER in view.js): update it
    // here if that max changes.
    // The bailout test comes BEFORE the step, like the CPU's while loop.
    int iter = 0;
    for (int i = 0; i < 5000; i++) {
        if (i >= uMaxIter) break;
        if (dot(z, z) >= 4.0) break;
        ${glsl.step}
        iter++;
    }

` + tailSource(glsl.step);
}

//DOUBLE-FLOAT ("dd") ARITHMETIC
//
//Why: a GPU float has a 24-bit mantissa, about 7 decimal digits. Deep in the Mandelbrot set
//neighbouring pixels differ in the 10th digit or later, so float32 cannot even tell them
//apart, and the iteration z -> z^2 + c would also lose them after a few steps. We cannot get
//real doubles in WebGL 1, so we emulate more precision.
//
//What a double-float is: a number stored as an UNEVALUATED SUM of two floats, hi + lo, where
//lo is tiny compared to hi (|lo| <= half an ulp of hi). hi holds the first ~7 digits and lo
//holds the next ~7, so together they carry about 48 bits (~14 digits). In GLSL a double-float
//is a vec2 (hi, lo). A COMPLEX double-float is a vec4 (re.hi, re.lo, im.hi, im.lo).
//
//The trick that makes it work is the ERROR-FREE TRANSFORMATIONS below. When a float add or
//multiply rounds, the rounding error is itself a float we can compute exactly with a few
//more operations. We keep that error as the new `lo` instead of throwing it away.
//
//THE uOne TRICK: these error formulas are only "pointless" algebra if you ignore rounding,
//e.g. (a + b) - a is just b on paper. A GPU shader compiler is allowed to optimise as if
//float maths were exact (it may reassociate, or constant-fold), and could then delete our
//error terms, silently turning every dd number back into a plain float. To stop that we
//multiply by the uniform uOne. JavaScript always sets it to exactly 1.0, so the value never
//changes, but the compiler cannot know that when it compiles the shader, so it cannot prove
//the terms cancel and has to keep them. (Some drivers are still too clever; that is why we
//run a self-test at startup, see runSelfTest.)
//
//All of this needs highp (full 32-bit) floats and no fused multiply-add; the dd shader is
//only used when highp exists and the self-test passed.
const DD_LIB = `
uniform float uOne; // always 1.0; see THE uOne TRICK above

// TWO-SUM (Knuth): s = a + b rounded, and err = the exact rounding error, so a + b == s + err
// exactly. Works for any a and b (no ordering needed), at the cost of 6 operations.
//   bb  = the part of b that actually made it into s
//   a - (s - bb) = the part of a that made it, b - bb = the part of b that did not
vec2 twoSum(float a, float b) {
    float s = a + b;
    float bb = s * uOne - a;
    float err = (a - (s - bb)) + (b - bb);
    return vec2(s, err);
}

// QUICK-TWO-SUM: the same, but only valid when |a| >= |b| (or a == 0). Fewer operations.
// Used to re-normalise (hi, lo) so that lo stays tiny compared to hi.
vec2 quickTwoSum(float a, float b) {
    float s = a + b;
    float err = b - (s * uOne - a);
    return vec2(s, err);
}

// DEKKER'S SPLIT: cuts a float into two halves of 12 bits each, a == hi + lo exactly.
// 4097 = 2^12 + 1 for a 24-bit mantissa. c is a rounded 'a * 4097'; subtracting (c - a) from
// c cancels the low 12 bits, leaving hi. With halves this short, any product hi*hi, hi*lo or
// lo*lo needs at most 24 bits, so it is computed WITHOUT rounding.
// (Large inputs (above about 2^100) would overflow here; our values stay below 2^10.)
vec2 split(float a) {
    float c = 4097.0 * a * uOne;
    float hi = c - (c - a);
    float lo = a - hi;
    return vec2(hi, lo);
}

// TWO-PRODUCT (Dekker): p = a * b rounded, and err = the exact rounding error, so
// a * b == p + err exactly. With an FMA this is one instruction; WebGL 1 has no FMA we can
// rely on, so we multiply the split halves and add up what p missed.
vec2 twoProd(float a, float b) {
    float p = a * b;
    vec2 sa = split(a);
    vec2 sb = split(b);
    float err = ((sa.x * sb.x - p * uOne) + sa.x * sb.y + sa.y * sb.x) + sa.y * sb.y;
    return vec2(p, err);
}

// ---- real double-float (hi, lo) ----

// the sum of two dd numbers (the accurate "IEEE" version: adds hi parts and lo parts with
// twoSum, then folds the errors back in and re-normalises twice)
vec2 ddAdd(vec2 a, vec2 b) {
    vec2 s = twoSum(a.x, b.x);
    vec2 t = twoSum(a.y, b.y);
    s.y += t.x;
    s = quickTwoSum(s.x, s.y);
    s.y += t.y;
    return quickTwoSum(s.x, s.y);
}

vec2 ddSub(vec2 a, vec2 b) {
    return ddAdd(a, -b);
}

// product of two dd numbers: the exact product of the hi parts (twoProd) plus the cross terms
// hi*lo and lo*hi (lo*lo is too small to matter)
vec2 ddMul(vec2 a, vec2 b) {
    vec2 p = twoProd(a.x, b.x);
    p.y += a.x * b.y + a.y * b.x;
    return quickTwoSum(p.x, p.y);
}

// dd times a plain float
vec2 ddMulF(vec2 a, float f) {
    vec2 p = twoProd(a.x, f);
    p.y += a.y * f;
    return quickTwoSum(p.x, p.y);
}

// ---- complex double-float: vec4 (re.hi, re.lo, im.hi, im.lo) ----

vec4 cdAdd(vec4 a, vec4 b) {
    return vec4(ddAdd(a.xy, b.xy), ddAdd(a.zw, b.zw));
}

// (a + bi)(c + di) = (ac - bd) + (ad + bc)i
vec4 cdMul(vec4 a, vec4 b) {
    return vec4(ddSub(ddMul(a.xy, b.xy), ddMul(a.zw, b.zw)),
                ddAdd(ddMul(a.xy, b.zw), ddMul(a.zw, b.xy)));
}

// (x + yi)^2 = (x^2 - y^2) + 2xyi: cheaper than cdMul (3 dd products instead of 4)
vec4 cdSqr(vec4 a) {
    return vec4(ddSub(ddMul(a.xy, a.xy), ddMul(a.zw, a.zw)),
                ddMulF(ddMul(a.xy, a.zw), 2.0));
}

// |x| and |y| of both parts (Burning Ship). The sign of a dd number is the sign of hi, so when
// hi < 0 we flip BOTH hi and lo.
vec4 cdAbs(vec4 a) {
    if (a.x < 0.0) a.xy = -a.xy;
    if (a.z < 0.0) a.zw = -a.zw;
    return a;
}

// z^n for a WHOLE n (2..8) by repeated multiplication. The loop bound must be constant in
// GLSL ES 1.00, so it is 8 and we break after n - 1 multiplications.
vec4 cdPowInt(vec4 z, int n) {
    if (n == 2) return cdSqr(z);
    vec4 r = z;
    for (int i = 1; i < 8; i++) {
        if (i >= n) break;
        r = cdMul(r, z);
    }
    return r;
}
`;

//Builds the DOUBLE-FLOAT fragment shader source for one fractal type. glslDD is its dd snippets;
//floatStep is its ordinary float step, used only for the few smooth-colouring steps after escape.
//The whole escape loop runs in double-float. Making only the pixel coordinates precise is not
//enough: neighbouring pixels differ in the 10th digit or later, and the iteration would
//round that difference away in the first few steps if z were a plain float.
function fragmentSourceDD(glslDD, floatStep) {
    return COMMON_HEAD + `
uniform vec2 uCenterHi;   // state.center split into hi + lo floats: (re, im)
uniform vec2 uCenterLo;
uniform float uInvZoom;   // 1 / state.zoom
uniform vec2 uCHi;        // state.c split the same way
uniform vec2 uCLo;
uniform int uPowerInt;    // the power as a whole number (dd is only used for whole powers)
` + DD_LIB + COMMON_FUNCS + `
void main() {
    // pixel number (see the float shader for why this conversion)
    float px = floor(gl_FragCoord.x);
    float py = uResolution.y - 1.0 - floor(gl_FragCoord.y);
    // The distance from the screen centre to this pixel, in complex units. It is SMALL (at
    // most a few thousand pixels / zoom), so one plain float holds it to 7 digits relative to
    // ITSELF, which is far finer than the pixel spacing. Only the sum with the centre needs
    // double-float.
    vec2 d = (vec2(px, py) - 0.5 * uResolution) * uInvZoom;

    // P = the pixel as a complex dd number = centre + d; C = state.c as a complex dd number
    vec4 P = vec4(ddAdd(vec2(uCenterHi.x, uCenterLo.x), vec2(d.x, 0.0)),
                  ddAdd(vec2(uCenterHi.y, uCenterLo.y), vec2(d.y, 0.0)));
    vec4 C = vec4(uCHi.x, uCLo.x, uCHi.y, uCLo.y);

    vec4 Z;
    vec4 K;
    ${glslDD.init}

    // same loop as the float shader, but in dd. The bailout test only needs the hi parts.
    int iter = 0;
    for (int i = 0; i < 5000; i++) {
        if (i >= uMaxIter) break;
        if (Z.x*Z.x + Z.z*Z.z >= 4.0) break;
        ${glslDD.step}
        iter++;
    }

    // Once |z| > 2 the lost digits no longer matter (the colour only depends on how fast |z|
    // grows), so drop to plain floats (hi parts) and reuse the float smooth-colouring code.
    vec2 z = Z.xz;
    vec2 k = K.xz;
` + tailSource(floatStep);
}

//SELF-TEST. Some GPU drivers reassociate or fuse float maths and delete the error terms even
//with the uOne trick, which would make the dd shader silently no better than float. So at
//startup we run a tiny shader that checks two known cases and paints its single pixel green
//when both error terms come out right, red otherwise.
//  twoSum(1, 1e-9): 1e-9 is far below half an ulp of 1, so s == 1 and err must be 1e-9.
//  twoProd(1 + 2^-20, 1 + 2^-20): exactly 1 + 2^-19 + 2^-40; the float p keeps 1 + 2^-19 and
//  err must be exactly 2^-40 (about 9.09e-13).
const SELFTEST_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
` + DD_LIB + `
void main() {
    float b = 1.0e-9 * uOne;
    vec2 s = twoSum(1.0, b);
    float a = (1.0 + 9.5367431640625e-7) * uOne;
    vec2 p = twoProd(a, a);
    bool sumOK = s.x == 1.0 && abs(s.y - 1.0e-9) < 1.0e-12;
    bool prodOK = abs(p.y - 9.094947017729282e-13) < 1.0e-15;
    gl_FragColor = (sumOK && prodOK) ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0);
}
`;

//Splits a JS number (a 64-bit double) into two floats with hi + lo == x (to ~48 bits).
//Math.fround(x) is x rounded to the nearest 32-bit float, so that is hi; what is left over,
//x - hi, is exactly representable as a double and tiny, and the GPU stores it as lo.
function splitDouble(x) {
    const hi = Math.fround(x);
    return [hi, x - hi];
}

//Magnification above which the dd shader is used. Below it the float shader is both faster
//and precise enough (it is fine up to about 1e5).
const DD_MIN_MAGNIFICATION = 1e4;
//Warning limits (see limitFor): the dd shader holds to about 1e11 (48 bits), float to 1e5.
const DD_LIMIT = 1e11;
const FLOAT_LIMIT = 1e5;

//true when n is a whole number (the dd shader can only do whole powers; see cdPowInt)
function isWholePower(n) {
    return Math.abs(n - Math.round(n)) < 1e-9;
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

//Sets up WebGL on the canvas and returns {draw, limitFor}:
//  draw(state)     renders the frame
//  limitFor(state) the magnification past which the picture stops being accurate for that
//                  state (used for the warning line)
export function createGLRenderer(canvas, gl) {
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const hasHighp = !!hp && hp.precision !== 0;
    if (!hasHighp) {
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

    //Compiled programs, one per fractal key (plus ":dd" for the double-float variant), built
    //lazily on first use. Each entry is { program, uniforms, aPos }.
    const cache = {};

    const COLOUR_UNIFORMS = ["uResolution", "uMaxIter", "uHueBase", "uHueSpeed", "uSat",
                             "uLight", "uMode", "uSmooth", "uPower"];
    const FLOAT_UNIFORMS = ["uCenter", "uZoom", "uC"];
    const DD_UNIFORMS = ["uCenterHi", "uCenterLo", "uInvZoom", "uCHi", "uCLo", "uPowerInt", "uOne"];

    function getProgram(key, deep = false) {
        const cacheKey = key + (deep ? ":dd" : "");
        if (cache[cacheKey]) return cache[cacheKey];
        const fractal = getFractal(key);
        const source = deep ? fragmentSourceDD(fractal.glslDD, fractal.glsl.step)
                            : fragmentSource(fractal.glsl);
        const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, source);
        const program = link(gl, vertexShader, fragmentShader);

        //look up where each uniform lives once, not on every draw
        const uniforms = {};
        for (const name of [...COLOUR_UNIFORMS, ...(deep ? DD_UNIFORMS : FLOAT_UNIFORMS)]) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        cache[cacheKey] = { program, uniforms, aPos: gl.getAttribLocation(program, "aPos") };
        return cache[cacheKey];
    }

    //Compile the default type now so a shader error is caught at startup
    //(main.js then falls back to the CPU) rather than on the first interaction.
    getProgram("julia");

    //Runs SELFTEST_SRC (see its comment) into a 1x1 viewport and reads the pixel back.
    //Returns true only when the double-float error terms survive this GPU's compiler.
    function runSelfTest() {
        if (!hasHighp) return false;
        try {
            const program = link(gl, vertexShader, compile(gl, gl.FRAGMENT_SHADER, SELFTEST_SRC));
            const oldViewport = gl.getParameter(gl.VIEWPORT);
            gl.useProgram(program);
            gl.uniform1f(gl.getUniformLocation(program, "uOne"), 1.0);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            const aPos = gl.getAttribLocation(program, "aPos");
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
            gl.viewport(0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            const pixel = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            gl.viewport(oldViewport[0], oldViewport[1], oldViewport[2], oldViewport[3]);
            gl.deleteProgram(program);
            //green = pass, red = fail
            return pixel[1] > 200 && pixel[0] < 50;
        } catch (e) {
            console.error("double-float self-test threw:", e);
            return false;
        }
    }

    //ddOK: the dd shader may be used at all (false: float only, limit 1e5)
    let ddOK = runSelfTest();
    if (!ddOK) {
        console.warn("double-float not reliable on this GPU; deep zoom limited to 1e5 on WebGL");
    }

    //dd is possible for this state: the shader works and the power is a whole number
    //(fractional powers need log and atan in double-float, which is not implemented)
    function ddUsable(state) {
        return ddOK && isWholePower(state.power);
    }

    function limitFor(state) {
        return ddUsable(state) ? DD_LIMIT : FLOAT_LIMIT;
    }

    //Sets the uniforms both shaders share
    function setCommonUniforms(u, state) {
        //same priority as colors.js: simple > bw > colour
        const mode = state.simple ? 2 : (state.bw ? 1 : 0);
        gl.uniform2f(u.uResolution, canvas.width, canvas.height);
        gl.uniform1i(u.uMaxIter, state.maxIter);
        gl.uniform1f(u.uHueBase, state.hueBase);
        gl.uniform1f(u.uHueSpeed, state.hueSpeed);
        gl.uniform1f(u.uSat, state.saturation);
        gl.uniform1f(u.uLight, state.lightness);
        gl.uniform1i(u.uMode, mode);
        gl.uniform1f(u.uSmooth, state.smoothness / 100);
        gl.uniform1f(u.uPower, state.power);
    }

    function draw(state) {
        //the drawing area must match the canvas size, so resizes work
        gl.viewport(0, 0, canvas.width, canvas.height);

        //Pick the shader: double-float when zoomed in deep, float otherwise (it is faster and
        //exact enough below DD_MIN_MAGNIFICATION). A dd shader that fails to compile (a driver
        //that rejects it) turns dd off for good and we carry on with float.
        let deep = ddUsable(state) && magnification(state) > DD_MIN_MAGNIFICATION;
        let p;
        if (deep) {
            try {
                p = getProgram(state.fractal, true);
            } catch (e) {
                console.warn("double-float shader failed to build; deep zoom limited to 1e5 on WebGL", e);
                ddOK = false;
                deep = false;
            }
        }
        if (!deep) p = getProgram(state.fractal);
        gl.useProgram(p.program);

        //feed the quad's corners to the vertex shader's aPos attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(p.aPos);
        gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0);

        const u = p.uniforms;
        setCommonUniforms(u, state);
        if (deep) {
            const [reHi, reLo] = splitDouble(state.center.re);
            const [imHi, imLo] = splitDouble(state.center.im);
            const [cReHi, cReLo] = splitDouble(state.c.re);
            const [cImHi, cImLo] = splitDouble(state.c.im);
            gl.uniform2f(u.uCenterHi, reHi, imHi);
            gl.uniform2f(u.uCenterLo, reLo, imLo);
            gl.uniform1f(u.uInvZoom, 1 / state.zoom);
            gl.uniform2f(u.uCHi, cReHi, cImHi);
            gl.uniform2f(u.uCLo, cReLo, cImLo);
            gl.uniform1i(u.uPowerInt, Math.round(state.power));
            gl.uniform1f(u.uOne, 1.0);
        } else {
            gl.uniform2f(u.uCenter, state.center.re, state.center.im);
            gl.uniform1f(u.uZoom, state.zoom);
            gl.uniform2f(u.uC, state.c.re, state.c.im);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    return { draw, limitFor };
}
