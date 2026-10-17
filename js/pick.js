// PICKING on the bulbs: "which point of the fractal's surface is under the cursor?"
//
// The shader answers that question for every pixel at once (one ray per pixel, sphere tracing).
// The zoom to the cursor needs the answer for ONE pixel, so we run the very same algorithm on the CPU,
// in JavaScript, with the bulb's distance estimator deJS (fractals.js). One ray of at most 300 steps is
// nothing for the CPU; doing it per mouse-wheel notch costs well under a millisecond.
import {getFractal} from './fractals.js';
import {bulbBasis, orbitFromEyeTarget, clampCam, BULB_LIMITS} from './mat4.js';
import {FOV_Y} from './bulbRenderer.js';

//the radius of the sphere that contains a bulb (MARCH_DEFAULTS.bound in bulbRenderer.js)
const BOUND = 1.5;
const MAX_STEPS = 300;
const MISS_DISTANCE = 20;

//THE CURSOR'S RAY: the eye and the direction of the ray through the screen pixel (sx, sy), built the same
//way the shader builds it (main() in bulbRenderer.js):
//    uv = (sx / width * 2 - 1, 1 - sy / height * 2)
//    rd = normalize(forward + uv.x * aspect * tanHalfFov * right + uv.y * tanHalfFov * up)
//The y is flipped: on the screen y grows DOWNWARD (0 = top), but the shader's uv.y (from gl_FragCoord)
//grows UPWARD, so the screen y is turned into 1 - 2 * sy / height.
export function cursorRay(state, canvas, sx, sy) {
    const {eye, forward, right, up} = bulbBasis(state.camBulb);
    const uvx = sx / canvas.width * 2 - 1;
    const uvy = 1 - sy / canvas.height * 2;
    const aspect = canvas.width / canvas.height;
    const tanHalf = Math.tan(FOV_Y / 2);
    const d = [0, 1, 2].map((i) => forward[i] + uvx * aspect * tanHalf * right[i] + uvy * tanHalf * up[i]);
    const len = Math.hypot(d[0], d[1], d[2]);
    return {eye, rd: [d[0] / len, d[1] / len, d[2] / len]};
}

//SPHERE TRACING one ray: from the eye along the cursor ray, jump forward by the distance estimate (nothing
//can be closer, so no surface is skipped) until the estimate drops below half a pixel's footprint at that
//distance (a HIT, the same test as the shader: d < eps * t, eps = 0.5 * pixelAngle) or the ray has gone
//farther than MISS_DISTANCE (a MISS: the cursor is over the background).
//Like the shader, an eye outside the bounding sphere starts at the point where the ray ENTERS the sphere
//(a quadratic in t, see the shader's comment) instead of crawling there in many steps, and a ray that
//misses the sphere is a miss at once.
//Returns {point, t, eye, rd} (t = the distance from the eye to the surface point) or null.
export function pickSurface(state, canvas, sx, sy) {
    const {eye, rd} = cursorRay(state, canvas, sx, sy);
    const de = getFractal(state.fractal).deJS;
    const pixelAngle = 2 * Math.tan(FOV_Y / 2) / canvas.height;
    const eps = 0.5 * pixelAngle;
    let t = 0;
    const b = eye[0] * rd[0] + eye[1] * rd[1] + eye[2] * rd[2];
    const c = eye[0] * eye[0] + eye[1] * eye[1] + eye[2] * eye[2] - BOUND * BOUND;
    if (c > 0) { //the eye is outside the sphere
        const h = b * b - c;
        if (h < 0) return null; //the ray never touches the sphere
        const tEnter = -b - Math.sqrt(h);
        if (tEnter < 0) return null; //the sphere is behind us
        t = tEnter;
    }
    for (let i = 0; i < MAX_STEPS; i++) {
        const d = de(eye[0] + rd[0] * t, eye[1] + rd[1] * t, eye[2] + rd[2] * t, state);
        if (d < eps * t) {
            return {point: [eye[0] + rd[0] * t, eye[1] + rd[1] * t, eye[2] + rd[2] * t], t, eye, rd};
        }
        t += d;
        if (t > MISS_DISTANCE) return null;
    }
    return null; //ran out of steps without settling: treat it as a miss (the wheel then just moves closer)
}

//THE ZOOM of the bulbs. One wheel notch (and the pinch, and the zoom field) moves the camera, never the
//fractal. The camera state is {yaw, pitch, dist, target}: an eye on a sphere of radius dist around the
//target, looking at the target. Zooming into a point P under the cursor means:
//  1. find P (pickSurface above);
//  2. move the EYE along the cursor ray toward P (a fraction of the way). Along that ray, and with the
//     camera turned the same way as before, P stays under the cursor: the pixel's ray does not change when
//     only the eye slides along it, which is why the point you aim at does not drift away from the cursor.
//     (Moving the eye straight along the view direction instead would push everything away from the
//     screen centre, and the spot under the cursor would slide out of place.)
//  3. move the TARGET with the eye: the point on the view axis at the (new) depth of P. Orbiting then
//     circles the detail you zoomed into (exactly P when the cursor was at the screen centre) instead of
//     the middle of the bulb, and dist shrinks with every notch, so the zoom has no fixed limit.
//  4. yaw, pitch and dist are RECOMPUTED from the new eye and target (orbitFromEyeTarget), because that is
//     all the camera state stores: the eye and target changed, so the three numbers must change to match.
//     The view direction is unchanged, so yaw and pitch come back the same and only dist and the target
//     move.
//The limit is the GPU, not this code: shader positions are 32-bit floats (about 7 digits, a float around 1
//resolves about 6e-8), so surface detail smaller than about 1e-7 cannot be drawn. A pixel is dist * pixelAngle
//wide and has to stay well above that, which gives dist of about 1e-3, i.e. 3e3x. Past it the surface turns
//to noise (the precision warning, main.js); the floor in BULB_LIMITS.distMin is far below that.

//Moves the camera `step` (a fraction, 0.2 = 20%) of the way toward the surface point under the cursor
//(sx, sy), in canvas pixels. On the background (no surface under the cursor) the camera moves the same
//fraction closer to the current target along the view direction, but only if it stays outside the
//surface: deJS(newEye) must stay above a quarter of the new distance, otherwise nothing happens.
export function bulbZoomIn(state, canvas, sx, sy, step = 0.2) {
    const cam = state.camBulb;
    const hit = pickSurface(state, canvas, sx, sy);
    if (!hit) {
        bulbSetDist(state, cam.dist * (1 - step));
        return;
    }
    const {forward} = bulbBasis(cam);
    const along = hit.t * (hit.rd[0] * forward[0] + hit.rd[1] * forward[1] + hit.rd[2] * forward[2]); //P's depth on the view axis
    const newEye = hit.eye.map((e, i) => e + hit.rd[i] * step * hit.t);
    const newTarget = newEye.map((e, i) => e + forward[i] * (1 - step) * along);
    const {yaw, pitch, dist} = orbitFromEyeTarget(newEye, newTarget);
    cam.yaw = yaw;
    cam.pitch = pitch;
    cam.dist = dist;
    cam.target = newTarget;
    clampCam(cam, BULB_LIMITS);
}

//Backs away from the current target: dist / scale (scale 0.8 = 25% farther), up to BULB_LIMITS.distMax.
//The target stays, so the same detail stays in the middle.
export function bulbZoomOut(state, scale = 0.8) {
    state.camBulb.dist /= scale;
    clampCam(state.camBulb, BULB_LIMITS);
}

//Sets the camera distance around the current target (the background wheel and the zoom field). Refused,
//with nothing changed, when the new eye would be in or too near the surface (see bulbZoomIn).
export function bulbSetDist(state, newDist) {
    const cam = state.camBulb;
    const {forward} = bulbBasis(cam);
    const target = cam.target ?? BULB_LIMITS.target;
    const newEye = target.map((t, i) => t - forward[i] * newDist);
    if (getFractal(state.fractal).deJS(newEye[0], newEye[1], newEye[2], state) <= 0.25 * newDist) return false;
    cam.dist = newDist;
    clampCam(cam, BULB_LIMITS);
    return true;
}
