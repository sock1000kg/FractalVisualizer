// Fractal registry.
// To add a new fractal: write its escape-time function below, then add ONE
// entry to FRACTALS. draw.js only talks to the registry, so nothing else
// needs to change.
//
// Entry shape:
//   name:    text shown in the type selector
//   iterate: (zx, zy, state, maxIter, out) => fills the reusable result object
//            out.iter   -> integer escape iteration count for one point (maxIter if inside)
//            out.smooth -> the smooth "normalized iteration count" nu (maxIter if inside),
//                          see smoothValue below
//   defaults: the view we jump to when this type is selected
//     c      -> starting value of state.c (the mouse-controlled parameter)
//     center -> complex point shown in the middle of the screen
//     zoom   -> pixels per unit of the complex plane
//   glsl:    the same fractal written as two GLSL snippets for the WebGL renderer
//     init -> sets the starting z and the constant k, from p (the pixel as a
//             complex number) and uC (state.c)
//     step -> one iteration, updating z
//     Keep these in sync with the iterate function above.

//SMOOTH COLOURING
//
//Why there are bands: the escape loop returns a whole number (iter), so every pixel
//that escapes on the same step gets exactly the same colour. Neighbouring steps
//give neighbouring colours, so the picture is made of flat rings ("bands").
//
//The fix is to turn the whole number into a fraction that says how far past the
//bailout the point went. Once |z| is large, each step roughly SQUARES it:
//|z| -> |z|^2, so ln|z| roughly DOUBLES every step. Taking a logarithm undoes one
//doubling: log2(ln|z|) goes up by about 1 per step. That is exactly the "one
//iteration" unit, and the fractional part of log2(ln|z| / ln 2) tells us where
//between two steps the point really crossed the bailout (0..1). Subtracting it from
//the integer count gives
//
//    nu = iter - log2( ln|z| / ln 2 )
//
//which changes continuously from pixel to pixel instead of jumping in whole steps.
//
//Why a few EXTRA steps: the "squares each step" rule is only accurate when |z| is
//already large. Right at the bailout radius (|z| about 2) it is a rough guess, which
//leaves faint ripples. So after the point escapes we run EXTRA more steps of the same
//formula (they do not change iter) to let |z| grow, and add EXTRA back to nu so the
//result stays on the same scale: nu = iter + EXTRA - log2( ln|z| / ln 2 ), with |z|
//measured AFTER the extra steps. For a point just past the boundary nu lies in
//(iter - 1, iter].
//
//The slider blend (colors.js): t = iter + s * (nu - iter), with s = smoothness / 100.
//s = 0 gives t = iter (the old banded look, pixel for pixel), s = 1 gives t = nu
//(fully smooth), and values in between give softened bands.
//
//Milestone 7 note: the 2 in log2 and in "ln 2" comes from the square in z^2. When the
//power becomes a general n, both turn into n (log base n, and ln n).
const EXTRA = 3;

//x, y: z AFTER the extra steps; extra: how many extra steps were run
export function smoothValue(iter, x, y, extra) {
    //ln|z| = 0.5 * ln(x^2 + y^2); dividing by ln 2 gives log2|z|.
    //A real escaped point has log2|z| >= 1; the max keeps log2() from ever seeing a
    //value <= 0 (which would give NaN) in odd cases such as a huge constant c.
    const log2z = Math.max(0.5 * Math.log(x*x + y*y) / Math.LN2, 1);
    const nu = iter + extra - Math.log2(log2z);
    //never below 0 (also turns a NaN into 0)
    return nu >= 0 ? nu : 0;
}

//Shared bookkeeping for the escape functions below. One loop does the normal
//iterations and then keeps going for EXTRA more steps once the point has escaped,
//so each fractal only has to write its update formula once.
//  - `escaped` is a flag, not a re-test of |z|^2 >= 4: with a large c a later step
//    could land back inside the circle, and we must not resume counting iter then.
//  - iter stops counting at the moment of escape, so it matches the old behaviour.

//z = zx + i*zy
//Julia: z -> z^2 + c, starting at the pixel
function julia(zx, zy, c, maxIter, out) {

    let x = zx, y = zy, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && extra === EXTRA) break;
      //z^2
      let xtemp = x*x - y*y + c.re;
      y = 2*x*y + c.im;
      x = xtemp;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, EXTRA) : maxIter;
}

//Mandelbrot: z -> z^2 + p, where p is the pixel and z starts at z0.
//The classic picture uses z0 = 0. We let the mouse move z0 (state.c) so the
//shape morphs as you move; with c = 0 it is the normal Mandelbrot set.
function mandelbrot(zx, zy, z0, maxIter, out) {

    let x = z0.re, y = z0.im, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && extra === EXTRA) break;
      //z^2 + p  (p = zx + i*zy is the constant here)
      let xtemp = x*x - y*y + zx;
      y = 2*x*y + zy;
      x = xtemp;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, EXTRA) : maxIter;
}

//Burning Ship: same as Mandelbrot, but take |x| and |y| before squaring.
//|x| and |y| only matter in the cross term: x^2 and y^2 are already positive,
//and (|x| + i|y|)^2 has imaginary part 2*|x|*|y| = 2*|x*y|.
function burningShip(zx, zy, z0, maxIter, out) {

    let x = z0.re, y = z0.im, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && extra === EXTRA) break;
      let xtemp = x*x - y*y + zx;
      y = 2*Math.abs(x*y) + zy;
      x = xtemp;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, EXTRA) : maxIter;
}

export const FRACTALS = {
    julia: {
        name: "Julia",
        //fills out.iter / out.smooth for one point of the complex plane
        //(state is passed in so each fractal can pick the parameters it needs, e.g. state.c)
        iterate: (zx, zy, state, maxIter, out) => julia(zx, zy, state.c, maxIter, out),
        //Julia: c is the constant, the pixel is the starting point
        defaults: { c: { re: -0.7, im: 0.27015 }, center: { re: 0, im: 0 }, zoom: 300 },
        //z -> z^2 + c, starting at the pixel
        glsl: {
            init: "z = p; k = uC;",
            step: "z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + k;",
        },
    },
    mandelbrot: {
        name: "Mandelbrot",
        //here state.c is the starting point z0 and the pixel is the constant
        iterate: (zx, zy, state, maxIter, out) => mandelbrot(zx, zy, state.c, maxIter, out),
        //the set spans about re -2..0.5, so centre on -0.5
        defaults: { c: { re: 0, im: 0 }, center: { re: -0.5, im: 0 }, zoom: 300 },
        //z -> z^2 + p, starting at the mouse-controlled uC
        glsl: {
            init: "z = uC; k = p;",
            step: "z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + k;",
        },
    },
    burningShip: {
        name: "Burning Ship",
        iterate: (zx, zy, state, maxIter, out) => burningShip(zx, zy, state.c, maxIter, out),
        //screen y points down, which shows the ship upright; centred on the main hull
        defaults: { c: { re: 0, im: 0 }, center: { re: -0.4, im: -0.5 }, zoom: 250 },
        //same as Mandelbrot, with abs() in the cross term
        glsl: {
            init: "z = uC; k = p;",
            step: "z = vec2(z.x*z.x - z.y*z.y, 2.0*abs(z.x*z.y)) + k;",
        },
    },
};

//Looks a fractal up by key. Unknown or missing keys fall back to Julia
//so a bad state value can never break drawing.
export function getFractal(key){
    return FRACTALS[key] || FRACTALS.julia;
}
