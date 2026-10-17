// 3D TERRAIN renderer: shows the current 2D fractal as a lit landscape.
//
// The idea: the "smooth escape value" t of every point of the 2D view becomes a HEIGHT. Points
// inside the set never escape, so they all get the maximum height and form a flat plateau.
// The terrain covers exactly the rectangle the 2D view showed.
//
// THE MESH (a grid of vertices)
//  The terrain is a flat grid of GRID x GRID points (250 x 250 = 62,500 vertices) joined into
//  triangles: every little square of the grid is split into 2 triangles. The vertices only
//  carry their grid position (u, v), each from 0 to 1 (u = left to right, v = top to bottom,
//  like screen pixels). The vertex and index buffers never change, so they are built once.
//  An INDEX buffer lists the triangles as triples of vertex numbers, so a vertex shared by 6
//  triangles is stored once. Indices are 16-bit (max 65535), and 62,500 vertices fit.
//
// WHY THE HEIGHT IS COMPUTED IN THE VERTEX SHADER
//  The 2D renderer runs the fractal maths once per PIXEL (fragment shader). Here we only need
//  one height per grid POINT, 62,500 instead of about a million pixels, so the expensive
//  escape loop runs in the VERTEX shader, once per vertex. The vertex shader can also place
//  the vertex (the height is its y coordinate), which a fragment shader cannot do. The
//  hardware then interpolates the colour between vertices and the fragment shader only has to
//  light the surface. That makes this a single, cheap pass, and the mesh needs no texture.
//
// THE DEPTH BUFFER
//  Several triangles can cover the same pixel (a hill hides what is behind it). The depth
//  buffer stores, for every pixel, the distance of the closest thing drawn so far; with
//  DEPTH_TEST on, a new triangle only replaces the pixel if it is closer. That way the order
//  of drawing does not matter. We switch it on only while drawing the terrain and clear it at
//  the start of each frame, so the 2D full-screen quad is unaffected.
//
// The shaders are WebGL 1 / GLSL ES 1.00, like the 2D ones (see glRenderer.js).
import {getFractal} from './fractals.js';
import {COLOUR_UNIFORM_DECLS, COMMON_FUNCS, colorizeSource, COLOUR_UNIFORMS, setColourUniforms,
        compile, link} from './glRenderer.js';
import {perspective, orbitView, clampCam} from './mat4.js';

//vertices per side of the grid (250 * 250 = 62,500 <= 65,536, so 16-bit indices work)
export const GRID = 250;
//camera lens: vertical field of view (radians) and the nearest / farthest drawn distance
export const FOV_Y = 0.8;
const NEAR = 0.05;
const FAR = 20;
//the largest height, in terrain units, at Height slider 100: uHeight = slider / 100 * this
export const MAX_HEIGHT = 0.6;

//Builds the grid: returns {uv: Float32Array of (u, v) pairs, indices: Uint16Array of triangles}.
//Vertex number of grid point (column i, row j) is j * GRID + i.
export function buildGrid(n = GRID) {
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const k = (j * n + i) * 2;
            uv[k] = i / (n - 1);
            uv[k + 1] = j / (n - 1);
        }
    }
    //(n - 1)^2 squares, each split into 2 triangles of 3 indices
    const indices = new Uint16Array((n - 1) * (n - 1) * 6);
    let w = 0;
    for (let j = 0; j < n - 1; j++) {
        for (let i = 0; i < n - 1; i++) {
            const a = j * n + i;       //top left of the square
            const b = a + 1;           //top right
            const c = a + n;           //bottom left
            const d = c + 1;           //bottom right
            indices[w++] = a; indices[w++] = c; indices[w++] = b;
            indices[w++] = b; indices[w++] = c; indices[w++] = d;
        }
    }
    return {uv, indices};
}

//VERTEX SHADER for one fractal type. `glsl` is its float snippets from the registry.
//Vertex shaders always have highp floats, so there is no double-float here: 3D is limited to
//the float precision (about 1e5 magnification), like the float 2D shader.
function vertexSource(glsl) {
    return `
precision highp float;
#define SAFE_LOG2 60.0
` + COLOUR_UNIFORM_DECLS + `
uniform vec2 uCenter;     // the 2D view: state.center as (re, im)
uniform float uZoom;      // state.zoom
uniform vec2 uC;          // state.c as (re, im)
uniform float uHeight;    // the highest the terrain gets, in world units
uniform mat4 uView;       // the camera (see lookAt in mat4.js)
uniform mat4 uProj;       // the lens (see perspective in mat4.js)

attribute vec2 aGrid;     // this vertex's place on the grid: (0, 0) top left .. (1, 1) bottom right

varying vec3 vWorld;      // the position in the world, for the lighting
varying vec3 vColor;      // the same colour the 2D view gives this point (0..1)
` + COMMON_FUNCS + colorizeSource(glsl.step) + `
void main() {
    // The grid point as a pixel of the 2D view, then the complex number there: exactly the
    // 2D shader's formula, so the terrain shows the rectangle the 2D view showed.
    vec2 pixel = aGrid * uResolution;
    vec2 p = uCenter + (pixel - 0.5 * uResolution) / uZoom;

    vec2 z;
    vec2 k;
    ${glsl.init}

    // the same escape loop as the 2D float shader (constant bound, break early)
    int iter = 0;
    for (int i = 0; i < 5000; i++) {
        if (i >= uMaxIter) break;
        if (dot(z, z) >= 4.0) break;
        ${glsl.step}
        iter++;
    }

    float t;
    vec3 rgb = colorize(iter, z, k, t);

    // HEIGHT: inside the set is the plateau at the top (1.0). Outside, t / maxIter runs 0..1
    // (fast escapers low, slow ones high). Most of the picture escapes after few steps, so
    // the raw ratio would leave it squashed near the ground; the square root spreads the low
    // values out so the slopes around the set are visible.
    bool inside = (iter == uMaxIter);
    float h = inside ? 1.0 : sqrt(clamp(t / float(uMaxIter), 0.0, 1.0));

    // The terrain lies flat in the x/z plane (y is up). Its sides keep the screen's aspect
    // ratio, so a square of the 2D view stays square: x is -aspect/2..aspect/2, z -0.5..0.5.
    // z grows with the grid row, so the top of the 2D picture is the far side.
    float aspect = uResolution.x / uResolution.y;
    vec3 world = vec3((aGrid.x - 0.5) * aspect, h * uHeight, aGrid.y - 0.5);

    vWorld = world;
    vColor = rgb / 255.0;
    // world -> camera -> clip space. The GPU does the perspective divide afterwards.
    gl_Position = uProj * uView * vec4(world, 1.0);
}
`;
}

//FRAGMENT SHADER (the same for every type): lights the surface.
//NORMALS FROM SCREEN-SPACE DERIVATIVES: the lighting needs the direction the surface faces
//(its normal). We never stored one. Instead, the GPU shades pixels in 2x2 blocks and can tell
//us how a value changes to the next pixel: dFdx(vWorld) is how the world position changes one
//pixel to the right, dFdy(vWorld) one pixel up. Those two vectors both lie IN the surface, so
//their cross product points out of it: that is the normal. Each triangle is flat, so the
//normal is constant over it ("flat shading", a faceted look).
//It needs the OES_standard_derivatives extension. Without it the shader falls back to no
//lighting (the plain colours). The #ifdef lines make the same source work in both cases.
const FRAGMENT_SRC = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vWorld;
varying vec3 vColor;

void main() {
    float light = 1.0;
#ifdef GL_OES_standard_derivatives
    vec3 g = cross(dFdx(vWorld), dFdy(vWorld));
    float len = length(g);
    // a degenerate (zero-area) pixel has no direction: treat it as facing up
    vec3 n = len > 0.0 ? g / len : vec3(0.0, 1.0, 0.0);
    // the cross product's sign depends on the triangle's winding; the terrain is a height
    // field seen from above, so the normal always points up
    if (n.y < 0.0) n = -n;
    // a fixed light from the upper left (a direction pointing TOWARDS the light) plus ambient
    // light, so faces turned away are dim, not black
    vec3 L = normalize(vec3(-0.5, 0.8, 0.3));
    light = 0.35 + 0.65 * max(dot(n, L), 0.0);
#endif
    gl_FragColor = vec4(vColor * light, 1.0);
}
`;

const TERRAIN_UNIFORMS = ["uCenter", "uZoom", "uC", "uHeight", "uView", "uProj"];

//Sets up the terrain renderer on a WebGL canvas and returns {draw}. draw(state) renders one
//frame and THROWS if a shader cannot be built (main.js then turns 3D off and keeps 2D).
export function createTerrainRenderer(canvas, gl) {
    //must be switched on from JS before a shader may use it
    const derivatives = gl.getExtension("OES_standard_derivatives");
    if (!derivatives) {
        console.warn("OES_standard_derivatives is not supported: the 3D terrain is drawn without lighting");
    }

    //the static mesh, uploaded once
    const grid = buildGrid();
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid.uv, gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW);

    let fragmentShader = null; //shared by every type, compiled on first use
    const cache = {}; //fractal key -> { program, uniforms, aGrid }, built lazily

    function getProgram(key) {
        if (cache[key]) return cache[key];
        if (!fragmentShader) fragmentShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
        const vertexShader = compile(gl, gl.VERTEX_SHADER, vertexSource(getFractal(key).glsl));
        const program = link(gl, vertexShader, fragmentShader);
        const uniforms = {};
        for (const name of [...COLOUR_UNIFORMS, ...TERRAIN_UNIFORMS]) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        cache[key] = { program, uniforms, aGrid: gl.getAttribLocation(program, "aGrid") };
        return cache[key];
    }

    function draw(state) {
        const p = getProgram(state.fractal);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(p.program);

        //the camera: orbit angles -> view matrix, plus the lens
        clampCam(state.cam3d);
        const u = p.uniforms;
        setColourUniforms(gl, canvas, u, state);
        gl.uniform2f(u.uCenter, state.center.re, state.center.im);
        gl.uniform1f(u.uZoom, state.zoom);
        gl.uniform2f(u.uC, state.c.re, state.c.im);
        gl.uniform1f(u.uHeight, state.height3d / 100 * MAX_HEIGHT);
        gl.uniformMatrix4fv(u.uView, false, orbitView(state.cam3d));
        gl.uniformMatrix4fv(u.uProj, false, perspective(FOV_Y, canvas.width / canvas.height, NEAR, FAR));

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(p.aGrid);
        gl.vertexAttribPointer(p.aGrid, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

        //depth test on for the terrain only; the depth buffer must be wiped each frame
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0.05, 0.05, 0.07, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.DEPTH_TEST);

        //leave the attribute off, so the 2D quad's draw (a different program, attribute
        //locations) starts from a clean state
        gl.disableVertexAttribArray(p.aGrid);
    }

    return { draw };
}
