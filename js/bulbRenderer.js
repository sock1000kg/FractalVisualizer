// 3D MANDELBULB + JULIABULB renderer: a fragment shader that RAYMARCHES a 3D fractal.
//
// The 2D renderer asks one question per pixel: "does this point of the plane escape?". A 3D
// fractal has no flat picture to ask that of. Instead we do what a camera does: for every pixel
// shoot a RAY from the eye through that pixel into space, find where it first touches the
// fractal's surface, and light that spot. There is no mesh: the surface is only known as the
// answer to "is this point of space inside the fractal?", so we have to FIND it along the ray.
//
// THE 3D POWER (White-Nylander). The 2D fractals iterate z -> z^n + c, where z^n multiplies the
// angle of z by n and raises its length to the n-th power (see power() in fractals.js). A 3D
// point has no "multiply" like complex numbers do, so the bulb copies the idea using spherical
// coordinates: write v = (x, y, z) with
//     r     = |v|                    the length
//     theta = acos(z / r)            the angle down from the +z axis (0..pi)
//     phi   = atan2(y, x)            the angle around the z axis
// and define the n-th power by raising r to n and MULTIPLYING BOTH ANGLES by n:
//     v^n = r^n * ( sin(n*theta) * cos(n*phi),  sin(n*theta) * sin(n*phi),  cos(n*theta) )
// It keeps the two things that make the complex power work: the length is raised to the power n
// (|v^n| = |v|^n), and the angles are multiplied by n. It is only one of many possible 3D powers
// (there is no true 3D "multiplication"); it is the one that gives the famous bulb. Fractional n
// works too, since it is just maths on angles.
//
// THE DISTANCE ESTIMATOR (DE). Finding the surface by testing tiny steps along the ray would be
// far too slow. A distance estimator is a function that, for any point, returns a distance that
// is guaranteed to be SMALLER than or equal to the real distance to the nearest surface. That
// guarantee makes it safe to jump forward that far along the ray: nothing can be in the way, so
// we cannot overshoot and miss the surface. Far from the fractal the jumps are big; near it they
// shrink, and we stop when the jump is smaller than a pixel. For z -> z^n + c the estimate comes
// from the derivative of the orbit: if r = |v| is where the point ended up and dr = |dv/dpos|
// says how fast that end point moves when the start moves, then the distance to the set is about
//     DE = 0.5 * ln(r) * r / dr
// (the same idea as the 2D "distance estimation" colouring). dr is tracked alongside the
// iteration, see de() below.
//
// Colour comes from an ORBIT TRAP: the smallest |v| the orbit ever reached. Points whose orbit
// came close to the origin get a different value from those that stayed away, which paints the
// bulb's lobes and grooves in different colours. That number becomes the "t" of colorFromT in
// glRenderer.js, so the hue, saturation, lightness, B&W and Simple settings all still work.
//
// WebGL 1 / GLSL ES 1.00, like the other shaders: loops need constant bounds.
import {getFractal} from './fractals.js';
import {COLOUR_UNIFORM_DECLS, COMMON_FUNCS, COLOR_FROM_T, COLOUR_UNIFORMS, setColourUniforms,
        compile, link, VERTEX_SRC} from './glRenderer.js';
import {bulbBasis, clampCam, BULB_LIMITS} from './mat4.js';

//camera lens: vertical field of view, in radians (the same lens as the terrain)
export const FOV_Y = 0.8;

//Builds the FRAGMENT shader for one bulb type. glsl3d is its {init, drPlus} from the registry.
export function bulbFragmentSource(glsl3d) {
    return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
` + COLOUR_UNIFORM_DECLS + `
uniform vec3 uC3;          // the 3D constant (c.re, c.im, cz)
uniform vec3 uCamPos;      // where the eye is
uniform vec3 uForward;     // the camera's axes (see bulbBasis in mat4.js)
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uTanHalfFov; // tan(fieldOfView / 2): how wide the lens sees
` + COMMON_FUNCS + COLOR_FROM_T + `
// The bulb is contained in a sphere of this radius around the origin, which we use below to
// skip rays that miss it entirely.
#define BOUND_RADIUS 1.5

// DISTANCE ESTIMATOR of the bulb at the point pos. Returns the estimated distance to the
// surface (negative inside) and the orbit trap through the out parameter.
float de(vec3 pos, out float trap) {
    ${glsl3d.init}   // v = the orbit's current vector, k = the vector added every step
    float dr = 1.0;  // |d v / d pos|: how fast the orbit moves when pos moves
    float r = length(v);
    trap = 1.0e4;

    // Why only 64 iterations (and the bound is a constant, as GLSL ES 1.00 needs): a distance
    // estimator only has to be right near the surface to within a pixel. An orbit that has not
    // escaped after 64 steps is so close to the set that the estimate is already below any
    // pixel, so more iterations just make a slightly better guess at a great cost. The user's
    // iteration slider can lower it further.
    for (int i = 0; i < 64; i++) {
        if (i >= uMaxIter) break;
        if (r > 2.0) break; // escaped: the bailout radius
        if (r > 0.0) {
            // the derivative: v^n has length r^n, so its rate of change is n * r^(n-1) times dr
            // (+ drPlus: 1 for the Mandelbulb, whose k = pos moves with the point; 0 for the Juliabulb)
            dr = uPower * pow(r, uPower - 1.0) * dr + ${glsl3d.drPlus};
            // the 3D power in spherical coordinates (see the top of this file).
            // acos wants -1..1 and float rounding can leave v.z / r just outside it, so clamp.
            float theta = acos(clamp(v.z / r, -1.0, 1.0));
            // atan(0.0, 0.0) is undefined in GLSL: a point on the z axis has no phi, use 0
            float phi = (v.x == 0.0 && v.y == 0.0) ? 0.0 : atan(v.y, v.x);
            float nt = uPower * theta;
            float np = uPower * phi;
            v = pow(r, uPower) * vec3(sin(nt) * cos(np), sin(nt) * sin(np), cos(nt)) + k;
        } else {
            // r == 0: v^n = 0 (and acos(0 / 0) would be NaN), so only the added vector is left
            dr = ${glsl3d.drPlus};
            v = k;
        }
        r = length(v);
        trap = min(trap, r);
    }
    // r is kept off 0 so log() never sees it; dr off 0 so we never divide by it
    float rr = max(r, 1.0e-6);
    return 0.5 * log(rr) * rr / max(dr, 1.0e-6);
}

// The surface NORMAL (the direction it faces, needed for lighting) by FINITE DIFFERENCES: the
// DE is a smooth "height above the surface", so the surface normal is the direction in which it
// grows fastest (its gradient). We cannot differentiate the iteration symbolically, so we sample
// it at a few points a tiny distance h apart and see which way it increases. The TETRAHEDRON
// technique uses 4 samples placed at the corners of a tetrahedron (the 4 of the cube's 8
// corners with an even number of minus signs); the weighted sum of them is the gradient, with
// 4 DE evaluations instead of the 6 that plain central differences need.
vec3 calcNormal(vec3 p, float h) {
    float tr; // the trap is not needed here
    const vec2 e = vec2(1.0, -1.0);
    float s = 0.5773 * h; // 0.5773 = 1 / sqrt(3): the corners are then h away from p
    return normalize(e.xyy * de(p + e.xyy * s, tr) +
                     e.yyx * de(p + e.yyx * s, tr) +
                     e.yxy * de(p + e.yxy * s, tr) +
                     e.xxx * de(p + e.xxx * s, tr));
}

void main() {
    // The PIXEL'S RAY. uv runs -1..1 across the screen (y up, like gl_FragCoord). The ray goes
    // from the eye straight ahead (uForward), pushed sideways by uv.x along uRight and up by
    // uv.y along uUp. uTanHalfFov says how far a screen edge is from the middle at distance 1,
    // and the screen is wider than tall, hence the aspect ratio on x.
    vec2 uv = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
    float aspect = uResolution.x / uResolution.y;
    vec3 ro = uCamPos;
    vec3 rd = normalize(uForward + (uv.x * aspect * uTanHalfFov) * uRight + (uv.y * uTanHalfFov) * uUp);

    // BACKGROUND: a dark vertical gradient, #1b1b2a at the bottom to #0b0b12 at the top. It is
    // the same in every colour mode.
    vec3 bg = mix(vec3(27.0, 27.0, 42.0), vec3(11.0, 11.0, 18.0), gl_FragCoord.y / uResolution.y) / 255.0;

    // BOUNDING SPHERE (a cheap speed-up): the bulb fits inside a sphere of radius BOUND_RADIUS,
    // so rays that never touch that sphere cannot hit the bulb and are painted as background
    // without any marching, and the others start where they ENTER the sphere instead of at the
    // eye. A ray ro + t*rd is on the sphere when |ro + t*rd|^2 = R^2, which is a quadratic in t
    // (b = dot(ro, rd), c = |ro|^2 - R^2, solutions t = -b -/+ sqrt(b^2 - c)). No real
    // solution (h < 0) = the ray misses; tFar < 0 = the sphere is behind us. When the eye is
    // inside the sphere the entry point is behind us, so the march starts at 0 instead.
    float b = dot(ro, rd);
    float h = b * b - (dot(ro, ro) - BOUND_RADIUS * BOUND_RADIUS);
    if (h < 0.0) {
        gl_FragColor = vec4(bg, 1.0);
        return;
    }
    float tFar = -b + sqrt(h);
    if (tFar < 0.0) {
        gl_FragColor = vec4(bg, 1.0);
        return;
    }
    float t = max(-b - sqrt(h), 0.0);
    float tMax = min(tFar, 10.0); // past 10 we call it a miss

    // THE RAYMARCH (sphere tracing) LOOP. Ask the DE how far the surface is at the current spot
    // and jump that far along the ray: by the DE's guarantee nothing is closer, so no surface can
    // be skipped. We HIT when the estimate is smaller than the size of one pixel at this
    // distance: the pixel's footprint grows with the distance travelled t, so the threshold
    // eps * t is looser far away (where one pixel covers more) and tighter close up.
    //   pixelAngle = 2 * uTanHalfFov / height  is the angle one pixel spans (radians)
    //   eps = 0.5 * pixelAngle                 half a pixel, so the edge is not visibly fuzzy
    // The loop stops after 128 steps (a constant bound). Rays that graze the surface need many
    // small steps; one that runs out of steps while still inside the sphere is close to the
    // surface, so it counts as a hit (this also darkens such edges through the AO below).
    float pixelAngle = 2.0 * uTanHalfFov / uResolution.y;
    float eps = 0.5 * pixelAngle;
    bool escaped = false;
    float steps = 128.0;
    float trap = 0.0;
    for (int i = 0; i < 128; i++) {
        float d = de(ro + rd * t, trap);
        if (d < eps * t) {
            steps = float(i);
            break;
        }
        t += d;
        if (t > tMax) {
            escaped = true;
            break;
        }
    }
    if (escaped) {
        gl_FragColor = vec4(bg, 1.0);
        return;
    }
    // (running out of the 128 steps leaves steps == 128 and escaped == false: still a surface)

    vec3 p = ro + rd * t;
    // the normal's sample distance: about a pixel's footprint, but never so small that float
    // rounding of p (about 1e-7) swamps the differences
    vec3 n = calcNormal(p, max(eps * t, 1.0e-5));

    // LIGHTING. A fixed key light (a direction pointing TOWARDS the light), Lambert's rule
    // (a surface is brighter the more it faces the light: dot(n, L)) and 0.25 ambient so the
    // shadowed side is dim and not black.
    vec3 L = normalize(vec3(0.5, 0.8, 0.6));
    float diffuse = 0.25 + 0.75 * max(dot(n, L), 0.0);
    // AMBIENT OCCLUSION from the step count: a ray that needed many steps passed close to the
    // surface for a long time, which happens in crevices and along edges where the shape
    // shadows itself. So more steps = darker, up to -80% at 128 steps. It costs nothing extra.
    float ao = 1.0 - steps / 128.0 * 0.8;
    // a small highlight: the light's mirror image in the surface, seen when the eye is near it
    float spec = pow(max(dot(reflect(-L, n), -rd), 0.0), 32.0) * 0.3;

    // colour: the orbit trap (0..about 2) scaled by 10 plays the part of the smooth iteration
    // count in the 2D colouring (colorFromT gives 0..255)
    vec3 base = colorFromT(trap * 10.0, false) / 255.0;
    vec3 col = base * diffuse * ao + vec3(spec) * ao;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
}

//the uniforms of the bulb shaders that are not in the shared colour set (setColourUniforms
//sets the colour ones: resolution, iterations, hue, ..., power)
export const BULB_UNIFORMS = ["uC3", "uCamPos", "uForward", "uRight", "uUp", "uTanHalfFov"];

//Sets up the bulb renderer on a WebGL canvas and returns {draw}. draw(state) renders one frame
//and THROWS if a shader cannot be built (main.js then goes back to Julia and shows a toast).
//Programs are compiled lazily, once per bulb type, so a shader problem shows up only when the
//type is used and never costs the 2D view.
export function createBulbRenderer(canvas, gl) {
    const vertexShader = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);

    //The full-screen quad, like the 2D path: two triangles covering clip space, so the fragment
    //shader runs once per pixel. (Its own buffer, so this renderer does not depend on the 2D one.)
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,   1, -1,   -1, 1,
        -1,  1,   1, -1,    1, 1,
    ]), gl.STATIC_DRAW);

    const cache = {}; //fractal key -> { program, uniforms, aPos }

    function getProgram(key) {
        if (cache[key]) return cache[key];
        const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, bulbFragmentSource(getFractal(key).glsl3d));
        const program = link(gl, vertexShader, fragmentShader);
        const uniforms = {};
        for (const name of [...COLOUR_UNIFORMS, ...BULB_UNIFORMS]) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        cache[key] = { program, uniforms, aPos: gl.getAttribLocation(program, "aPos") };
        return cache[key];
    }

    function draw(state) {
        const p = getProgram(state.fractal);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(p.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(p.aPos);
        gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0);

        //the camera: orbit angles -> eye position and axes
        clampCam(state.camBulb, BULB_LIMITS);
        const {eye, forward, right, up} = bulbBasis(state.camBulb);
        const u = p.uniforms;
        setColourUniforms(gl, canvas, u, state);
        gl.uniform3f(u.uC3, state.c.re, state.c.im, state.cz);
        gl.uniform3f(u.uCamPos, eye[0], eye[1], eye[2]);
        gl.uniform3f(u.uForward, forward[0], forward[1], forward[2]);
        gl.uniform3f(u.uRight, right[0], right[1], right[2]);
        gl.uniform3f(u.uUp, up[0], up[1], up[2]);
        gl.uniform1f(u.uTanHalfFov, Math.tan(FOV_Y / 2));

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(p.aPos);
    }

    return { draw };
}
