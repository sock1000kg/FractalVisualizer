//SMALL MATRIX MATHS for the 3D terrain camera (no library needed for this little).
//
//A 4x4 MATRIX turns a 3D point into another one. We write a point as (x, y, z, 1) (the extra
//1 lets a matrix also MOVE points, not only turn and scale them). WebGL wants the 16 numbers
//in COLUMN-MAJOR order: element (row r, column c) is at index c * 4 + r, so the first four
//numbers are the first column. All functions below return a new Float32Array(16) in that
//layout, ready for gl.uniformMatrix4fv.
//
//THE CAMERA PIPELINE (what the terrain vertex shader does with these):
//    clip = projection * view * (x, y, z, 1)
//  view       moves and turns the world so the camera sits at the origin looking down -z
//             (lookAt builds it)
//  projection squashes the camera's view volume (a pyramid with its tip cut off, the
//             "frustum") into the cube WebGL draws, so far things get smaller (perspective)
//             (perspective builds it)

//the 4x4 identity: leaves every point where it is
export function identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
}

//a * b: first apply b, then a (so projection * view means "view first, then project").
//Each result element is a row of a times a column of b.
export function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = sum;
        }
    }
    return out;
}

//PERSPECTIVE PROJECTION.
//  fovY    the vertical field of view in radians (how wide the camera sees)
//  aspect  width / height of the screen
//  near, far  the nearest and farthest distances that are drawn (both > 0)
//f = 1 / tan(fovY / 2) is how much the picture is zoomed: a narrow view (small fovY) gives a
//big f. x and y are scaled by f (x also by 1 / aspect so circles stay round). z is mapped so
//near ends up at -1 and far at +1 (WebGL's depth range). The -1 in the last row makes w = -z,
//and WebGL later divides x, y and z by w: that division is the perspective, it makes things
//farther away (bigger -z) land closer to the screen centre.
export function perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = 2 * far * near / (near - far);
    return out;
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a) {
    const len = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / len, a[1] / len, a[2] / len];
}

//LOOK-AT VIEW MATRIX: a camera at `eye` looking at `target`, with `up` roughly overhead.
//We build the camera's own three axes:
//  z = from the target back to the eye (the camera looks down -z, so z points BEHIND it)
//  x = up x z   (the camera's right)
//  y = z x x    (the camera's true up; `up` was only a hint, this one is exactly perpendicular)
//The view matrix has these axes as its ROWS (so it turns world directions into camera
//directions) and the last column moves the eye to the origin: -dot(axis, eye).
//A point at `target` ends up straight ahead on the -z axis, i.e. the screen centre.
export function lookAt(eye, target, up) {
    const z = normalize(sub(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    const out = new Float32Array(16);
    out[0] = x[0]; out[4] = x[1]; out[8] = x[2];  out[12] = -dot(x, eye);
    out[1] = y[0]; out[5] = y[1]; out[9] = y[2];  out[13] = -dot(y, eye);
    out[2] = z[0]; out[6] = z[1]; out[10] = z[2]; out[14] = -dot(z, eye);
    out[15] = 1;
    return out;
}

//ORBIT CAMERA
//The camera circles a fixed point (the middle of the terrain) like a satellite. Its position
//is described by three numbers (state.cam3d), not by a matrix:
//  yaw    the angle around the vertical axis (drag left/right), radians
//  pitch  the angle above the ground plane (drag up/down): 0 = level with the ground,
//         pi/2 = straight down from above
//  dist   the distance from the target, in terrain units
//Spherical coordinates turn these into a position: the horizontal circle has radius
//dist * cos(pitch) (it shrinks as you look more from above), the height is dist * sin(pitch).
export const CAM_TARGET = [0, 0.15, 0]; //a little above the ground, about the middle of the hills
//target is the point the camera orbits and looks at. It starts at CAM_TARGET but Ctrl + middle-drag
//can move it (see moveTarget), so it is part of the camera state; a copy keeps the constant safe.
export const DEFAULT_CAM = {yaw: -0.6, pitch: 0.75, dist: 1.6, target: [...CAM_TARGET]};
export const PITCH_MIN = 0.1; //never exactly level (the terrain would be a line) ...
export const PITCH_MAX = 1.45; //... and never straight down (lookAt's "up" would be parallel to the view)
export const DIST_MIN = 0.6;
export const DIST_MAX = 4;

//The middle of a bulb (the bulbs live in the unit sphere around the origin)
export const BULB_TARGET = [0, 0, 0];

//The limits of an orbit camera: pitch and distance ranges, plus the box the moved target must
//stay in (targetMin / targetMax) so the camera cannot wander off and get lost. `target` is the
//default used when a camera state has none (e.g. an old preset). The terrain and the bulbs have
//different framing, so each has its own set (the maths below is shared).
export const TERRAIN_LIMITS = {
    pitchMin: PITCH_MIN, pitchMax: PITCH_MAX, distMin: DIST_MIN, distMax: DIST_MAX,
    target: CAM_TARGET, targetMin: [-1.5, -0.5, -1.5], targetMax: [1.5, 1.5, 1.5],
};
//A bulb is seen from every side, so the pitch may go (nearly) all the way over the poles.
//The distance stops just outside the unit sphere (a bulb reaches out to about 1.2).
export const BULB_LIMITS = {
    pitchMin: -1.45, pitchMax: 1.45, distMin: 1.02, distMax: 8,
    target: BULB_TARGET, targetMin: [-3, -3, -3], targetMax: [3, 3, 3],
};

export function clampCam(cam, limits = TERRAIN_LIMITS) {
    cam.pitch = Math.max(limits.pitchMin, Math.min(limits.pitchMax, cam.pitch));
    cam.dist = Math.max(limits.distMin, Math.min(limits.distMax, cam.dist));
}

//the eye position for a camera state (orbiting `target`, by default the camera's own target)
export function orbitEye(cam, target = cam.target ?? CAM_TARGET) {
    return [
        target[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
        target[1] + cam.dist * Math.sin(cam.pitch),
        target[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
    ];
}

//the view matrix of an orbit camera
export function orbitView(cam) {
    const target = cam.target ?? CAM_TARGET;
    return lookAt(orbitEye(cam, target), target, [0, 1, 0]);
}

//THE BULB CAMERA: the Mandelbulb shader does not use matrices. It shoots one ray per pixel,
//so all it needs is where the eye is and the camera's three axes as plain vectors:
//  forward  the direction the camera looks (from the eye to the middle of the bulb)
//  right    the camera's right    = forward x up
//  up       the camera's true up  = right x forward  (perpendicular to both)
//(the same axes lookAt builds above, but facing the other way: lookAt's z axis is -forward).
//The shader then aims a pixel's ray along  forward + sx * right + sy * up,  where sx, sy
//say how far the pixel is from the screen centre.
//(the point it looks at is the camera's target, which starts at the middle of the bulb)
export function bulbBasis(cam) {
    const target = cam.target ?? BULB_TARGET;
    const eye = orbitEye(cam, target);
    const forward = normalize(sub(target, eye));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    return {eye, forward, right, up};
}

//MOVE THE CAMERA (Ctrl + middle-drag): slide the target, and with it the whole orbit, sideways
//and up/down as seen from the camera.
//  dxPixels, dyPixels  how far the mouse moved on screen
//  viewportHeight      the canvas height in pixels
//  limits              TERRAIN_LIMITS or BULB_LIMITS (the box the target must stay in)
//  fovY                the vertical field of view the renderer uses (radians)
//At distance `dist` the camera sees a slice of the world 2 * dist * tan(fovY / 2) tall. That
//slice fills viewportHeight pixels, so one pixel is worth
//    scale = 2 * dist * tan(fovY / 2) / viewportHeight    world units.
//With that scale the point under the cursor roughly follows the cursor.
//Signs: dragging the mouse RIGHT should drag the scene right, which means the camera (and its
//target) move LEFT, against the camera's right axis: target -= right * dx * scale.
//Screen y grows DOWNWARD, so dragging DOWN drags the scene down, i.e. the camera moves UP:
//target += up * dy * scale.
//The basis is the same one bulbBasis builds (forward = target - eye).
export function moveTarget(cam, dxPixels, dyPixels, viewportHeight, limits = TERRAIN_LIMITS, fovY = 0.8) {
    const target = cam.target ?? limits.target;
    const forward = normalize(sub(target, orbitEye(cam, target)));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const scale = 2 * cam.dist * Math.tan(fovY / 2) / viewportHeight;
    const moved = [0, 1, 2].map((i) => {
        const v = target[i] - right[i] * dxPixels * scale + up[i] * dyPixels * scale;
        return Math.max(limits.targetMin[i], Math.min(limits.targetMax[i], v));
    });
    cam.target = moved; //a new array, so a target shared with a default/preset object is never mutated
}
