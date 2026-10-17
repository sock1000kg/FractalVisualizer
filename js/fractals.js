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
//            state.power is the exponent n of z -> z^n + k (2 = the classic z^2)
//   defaults: the view we jump to when this type is selected
//     c      -> starting value of state.c (the mouse-controlled parameter)
//     center -> complex point shown in the middle of the screen
//     zoom   -> pixels per unit of the complex plane
//   juliaOf: (optional) key of the Julia-style type that belongs to this one. Types with
//            this field get the Julia preview inset and click-to-jump (see the
//            MANDELBROT <-> JULIA comment below). Types added later can opt in with it.
//   glsl:    the same fractal written as two GLSL snippets for the WebGL renderer
//     init -> sets the starting z and the constant k, from p (the pixel as a
//             complex number) and uC (state.c)
//     step -> one iteration, updating z; uses cpow(z, uPower) (defined in glRenderer.js)
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
//POWER n (z -> z^n + k)
//
//Only the OUTER log depends on the power. The two logarithms in the formula come from
//different places:
//  - ln 2 (inside, in log2|z| = ln|z| / ln 2) comes from the BAILOUT RADIUS R = 2. It is
//    just the unit we measure |z| in, so it stays 2 whatever the power is.
//  - The outer log comes from the power. One step turns |z| into about |z|^n, so
//    ln|z| gets MULTIPLIED by n each step. Taking a log base n undoes one multiplication,
//    so ln(log2|z|) / ln n goes up by about 1 per step: that is the "one iteration" unit.
//So the general formula is
//
//    nu = iter + extraDone - ln( log2|z| ) / ln n
//
//and for n = 2 it is exactly the formula above (ln(x) / ln 2 = log2(x)).
//
//Overflow guard: with a big n, |z| explodes (n = 8: 256, 1e19, ...). Before each extra
//step we check log2|z| * n > SAFE_LOG2: that is log2 of the |z| the step would produce.
//2^60 is the limit because dot(z, z) is then below 2^120, inside the float32 range of
//the GPU. The CPU uses the same rule so both renderers agree. Because the steps can stop
//early, nu uses the number of extra steps actually done (extraDone), not the constant.
//MANDELBROT <-> JULIA: why every Mandelbrot point has its own Julia set
//
//Both pictures iterate the SAME formula  z -> z^n + k.  They only differ in what is
//fixed and what changes from pixel to pixel:
//  - Julia set for a constant c:  k = c is fixed, the pixel is the STARTING value z.
//  - Mandelbrot set:              z starts at 0, the pixel is the constant k.
//So a Mandelbrot pixel p asks "does z -> z^n + p, started at 0, stay bounded?", and the
//Julia set for c = p is the picture of ALL starting values for that same formula.
//Every point p of the Mandelbrot picture therefore names exactly one Julia set:
//  - p INSIDE the Mandelbrot set  -> the Julia set for c = p is one connected piece
//  - p OUTSIDE the Mandelbrot set -> the Julia set for c = p is disconnected "dust"
//Burning Ship works the same way with abs() applied before the power: its counterpart
//is the "Burning Ship Julia" type below (fixed constant, pixel is the start).
//
//Note: in this app state.c on a Mandelbrot type is the starting value z0, not 0. The
//correspondence above is exact when z0 = 0; with another z0 the Mandelbrot picture is a
//morphed version, but p is still the constant that selects the Julia set.
const EXTRA = 3;
const SAFE_LOG2 = 60;

//z^n for a real n, with z = x + i*y. The result goes into the module-level scratch
//variables PX / PY instead of a returned object, so the hot loop allocates nothing.
//(JS runs single-threaded and each caller reads PX / PY right after the call, so
//sharing them is safe.)
//
//POLAR FORM: write z = r*(cos t + i*sin t) with r = |z| and t = atan2(y, x). Raising to
//a power multiplies the angle and raises the length:
//    z^n = r^n * (cos(n*t) + i*sin(n*t))        and r^n = (r^2)^(n/2)
//(we have r^2 = x^2 + y^2 for free, so no sqrt is needed).
//
//The SEAM: atan2 returns angles in (-pi, pi], and the picture jumps from +pi to -pi along
//the negative real axis. For a whole n the jump is a multiple of 2*pi after multiplying
//by n, so cos/sin do not notice. For a fractional n it is not, so z^n is discontinuous
//there and a straight seam appears in the image. That is how fractional powers look
//(they are many-valued), so it is expected and not "fixed".
let PX = 0, PY = 0;
function power(x, y, n) {
    if (n === 2) {
        //fast path: the plain algebraic square (also keeps n = 2 pixel-identical)
        PX = x*x - y*y;
        PY = 2*x*y;
        return;
    }
    const r2 = x*x + y*y;
    if (r2 === 0) {
        //atan2(0, 0) is meaningless and 0^n = 0, so answer directly
        PX = 0;
        PY = 0;
        return;
    }
    const rn = Math.pow(r2, n / 2);
    const nt = n * Math.atan2(y, x);
    PX = rn * Math.cos(nt);
    PY = rn * Math.sin(nt);
}

//true when one more step could push |z|^2 past the float32 range (see the guard above)
function tooBig(x, y, n) {
    return 0.5 * Math.log(x*x + y*y) / Math.LN2 * n > SAFE_LOG2;
}

//x, y: z AFTER the extra steps; extra: how many extra steps were actually run;
//n: the power
export function smoothValue(iter, x, y, extra, n) {
    //ln|z| = 0.5 * ln(x^2 + y^2); dividing by ln 2 gives log2|z|.
    //A real escaped point has log2|z| >= 1; the max keeps log2() from ever seeing a
    //value <= 0 (which would give NaN) in odd cases such as a huge constant c.
    const log2z = Math.max(0.5 * Math.log(x*x + y*y) / Math.LN2, 1);
    //log base n of log2z (at n = 2 use Math.log2 so the result is bit-identical to before)
    const nu = iter + extra - (n === 2 ? Math.log2(log2z) : Math.log(log2z) / Math.log(n));
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
//Julia: z -> z^n + c, starting at the pixel
function julia(zx, zy, c, n, maxIter, out) {

    let x = zx, y = zy, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && (extra === EXTRA || tooBig(x, y, n))) break;
      //z^n + c
      power(x, y, n);
      x = PX + c.re;
      y = PY + c.im;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, extra, n) : maxIter;
}

//Mandelbrot: z -> z^n + p, where p is the pixel and z starts at z0.
//The classic picture uses z0 = 0. We let the mouse move z0 (state.c) so the
//shape morphs as you move; with c = 0 it is the normal Mandelbrot set.
function mandelbrot(zx, zy, z0, n, maxIter, out) {

    let x = z0.re, y = z0.im, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && (extra === EXTRA || tooBig(x, y, n))) break;
      //z^n + p  (p = zx + i*zy is the constant here)
      power(x, y, n);
      x = PX + zx;
      y = PY + zy;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, extra, n) : maxIter;
}

//Burning Ship: same as Mandelbrot, but take |x| and |y| before raising to the power.
//At n = 2 this is the old (x^2 - y^2, 2*|x*y|): x^2 and y^2 are already positive, and
//(|x| + i|y|)^2 has imaginary part 2*|x|*|y| = 2*|x*y| (exactly, in floating point too).
function burningShip(zx, zy, z0, n, maxIter, out) {

    let x = z0.re, y = z0.im, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && (extra === EXTRA || tooBig(x, y, n))) break;
      power(Math.abs(x), Math.abs(y), n);
      x = PX + zx;
      y = PY + zy;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, extra, n) : maxIter;
}

//Burning Ship Julia: z -> (|x| + i|y|)^n + c, starting at the pixel.
//The Julia counterpart of burningShip: the constant is fixed (state.c), the pixel is
//the starting point, and abs() is applied to both parts before the power.
function burningShipJulia(zx, zy, c, n, maxIter, out) {

    let x = zx, y = zy, iter = 0, extra = 0, escaped = false;
    while (true) {
      if (!escaped) {
        if (iter === maxIter) break; //hit the limit first: inside the set (checked first, like the old loop)
        if (x*x + y*y >= 4) escaped = true;
      }
      if (escaped && (extra === EXTRA || tooBig(x, y, n))) break;
      power(Math.abs(x), Math.abs(y), n);
      x = PX + c.re;
      y = PY + c.im;
      if (escaped) extra++; else iter++;
    }
    out.iter = iter;
    out.smooth = escaped ? smoothValue(iter, x, y, extra, n) : maxIter;
}

export const FRACTALS = {
    julia: {
        name: "Julia",
        //fills out.iter / out.smooth for one point of the complex plane
        //(state is passed in so each fractal can pick the parameters it needs, e.g. state.c)
        iterate: (zx, zy, state, maxIter, out) => julia(zx, zy, state.c, state.power, maxIter, out),
        //Julia: c is the constant, the pixel is the starting point
        defaults: { c: { re: -0.7, im: 0.27015 }, center: { re: 0, im: 0 }, zoom: 300 },
        //z -> z^n + c, starting at the pixel
        glsl: {
            init: "z = p; k = uC;",
            step: "z = cpow(z, uPower) + k;",
        },
    },
    mandelbrot: {
        name: "Mandelbrot",
        //here state.c is the starting point z0 and the pixel is the constant
        iterate: (zx, zy, state, maxIter, out) => mandelbrot(zx, zy, state.c, state.power, maxIter, out),
        //the set spans about re -2..0.5, so centre on -0.5
        defaults: { c: { re: 0, im: 0 }, center: { re: -0.5, im: 0 }, zoom: 300 },
        juliaOf: "julia", //hover preview and click-to-jump use the Julia type
        //z -> z^n + p, starting at the mouse-controlled uC
        glsl: {
            init: "z = uC; k = p;",
            step: "z = cpow(z, uPower) + k;",
        },
    },
    burningShip: {
        name: "Burning Ship",
        iterate: (zx, zy, state, maxIter, out) => burningShip(zx, zy, state.c, state.power, maxIter, out),
        //screen y points down, which shows the ship upright; centred on the main hull
        defaults: { c: { re: 0, im: 0 }, center: { re: -0.4, im: -0.5 }, zoom: 250 },
        juliaOf: "burningShipJulia",
        //same as Mandelbrot, with abs() of both parts before the power
        glsl: {
            init: "z = uC; k = p;",
            step: "z = cpow(abs(z), uPower) + k;",
        },
    },
    burningShipJulia: {
        name: "Burning Ship Julia",
        iterate: (zx, zy, state, maxIter, out) => burningShipJulia(zx, zy, state.c, state.power, maxIter, out),
        //c is a point inside the Burning Ship's main body, so the set is connected
        defaults: { c: { re: -0.5, im: -0.5 }, center: { re: 0, im: 0 }, zoom: 300 },
        //like Julia (constant uC, start at the pixel) with abs() before the power
        glsl: {
            init: "z = p; k = uC;",
            step: "z = cpow(abs(z), uPower) + k;",
        },
    },
};

//Looks a fractal up by key. Unknown or missing keys fall back to Julia
//so a bad state value can never break drawing.
export function getFractal(key){
    return FRACTALS[key] || FRACTALS.julia;
}
