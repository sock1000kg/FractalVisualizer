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
//   kind:    the ROLE of the pixel (see the MANDELBROT <-> JULIA comment below)
//            "mandelbrot" -> the pixel is the constant p, and state.c is the start z0
//            "julia"      -> the pixel is the start z0, and state.c is the constant c
//   partner: (optional) key of the linked type of the opposite kind. Types with this field
//            get the preview inset (the partner, drawn small) and click-to-jump in both
//            directions. Both entries of a pair must name each other. Types added later
//            can opt in with it.
//   formula: (state) => {title, eq, vars}: the equation as three short parts, with the live
//            values filled in. title is the name, eq the iteration, vars what the pixel and
//            state.c mean. The UI puts each part on its own line (so long values wrap instead
//            of stretching a box). Pass a different state (e.g. the inset's) to get that
//            view's equation.
//   glsl:    the same fractal written as two GLSL snippets for the WebGL renderer
//     init -> sets the starting z and the constant k, from p (the pixel as a
//             complex number) and uC (state.c)
//     step -> one iteration, updating z; uses cpow(z, uPower) (defined in glRenderer.js)
//     Keep these in sync with the iterate function above.
//   glslDD:  the same fractal for the DOUBLE-FLOAT shader used when zoomed in deep (see DD_LIB in
//            glRenderer.js). Same idea as glsl, but z and k are vec4 complex double-floats
//            named Z and K (capitals, so they never clash with the float z / k):
//     init -> sets Z and K from P (the pixel) and C (state.c), both vec4 complex dd numbers
//     step -> one iteration; uses cdAdd, cdPowInt(Z, uPowerInt) and cdAbs. Whole powers only.
//     Keep these in sync with glsl above.
//
// 3D bulbs (Mandelbulb, Juliabulb) are a different kind of entry. They have no iterate, glsl or
// glslDD, because they are not drawn per point of the complex plane but raymarched in 3D
// (bulbRenderer.js). Their extra / different fields:
//   render:   "raymarch" marks a bulb. Every other entry is a 2D type and leaves it out.
//   needsWebGL: true -> the CPU renderer cannot draw it (the selector disables the option)
//   glsl3d:   {init, drPlus}: the two GLSL snippets that tell the shared distance estimator
//             which bulb this is (see MANDELBULB below for what they mean)
//   defaults: c and cz (the 3D constant (c.re, c.im, cz)), power, and cam (yaw, pitch, dist of
//             the orbit camera). There is no center / zoom: the "zoom" of a bulb is the
//             camera distance. Bulbs have no kind or partner (no inset, no jump).
//
// Every raymarched entry provides its distance estimator in ONE of two ways (glsl3d):
//   {init, drPlus}  a bulb: the shared bulb estimator in bulbRenderer.js is built from the two snippets
//   {de}            a full GLSL function  float de(vec3 pos, out float trap)  used as it is (Mandelbox)
// and may add  march: {steps, bound, far, fog, trapScale, iterCap, headlight}  to tune the raymarcher
// for it (see MARCH_DEFAULTS in bulbRenderer.js for what each means and the values the bulbs use).
// A  {de}  entry may also bring its own GLSL declarations: glsl3d.uniforms (extra "uniform ..." lines)
// and glsl3d.defines (extra "#define ..." lines), which the shader template pastes in as they are.
// An entry with  camera: "fly"  is flown with WASD (state.camFly) instead of orbited (state.camBulb);
// its defaults then carry  camFly  (and its own shape parameter: scale for the Mandelbox, kleinSize
// for the Kleinian) instead of  cam. A fly entry MUST also provide
//   deJS: (x, y, z, state) => distance   the SAME distance estimator as its GLSL de(), in JS doubles
// because the fly camera asks it how far the nearest surface is (adaptive speed, collision, the
// precision warning) through getFractal(state.fractal).deJS, whatever the fly type is.
// The bulbs have a deJS too (the cursor picking of the zoom, pick.js), but that does NOT make them fly types:
// being flown is decided by  camera: "fly"  alone (isFly), never by the presence of deJS.

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
//That is what `kind` means in the registry: on a "mandelbrot" kind the pixel is the
//constant p (and state.c is the start z0); on a "julia" kind the pixel is the start z0
//(and state.c is the constant c). `partner` links the two sides, so the inset can show
//the other side of the pair and a click can jump across.
//
//Note: in this app state.c on a Mandelbrot type is the starting value z0, not 0. The
//correspondence above is exact when z0 = 0; with another z0 the Mandelbrot picture is a
//morphed version, but p is still the constant that selects the Julia set.
const EXTRA = 3;
const SAFE_LOG2 = 60;

//EQUATION TEXT
//Small helpers that turn numbers into text for the on-screen formula lines.

//The power as text: whole numbers 2..8 become a superscript (z² + c); anything else
//(like 2.5) is written with a caret and one decimal place (z^2.5 + c).
const SUPERSCRIPTS = {2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸"};
export function formatPower(n) {
    return SUPERSCRIPTS[n] ?? "^" + n.toFixed(1);
}

//A complex number as text with 3 decimal places and a real minus sign: "−0.700 + 0.270i".
//A value that rounds to zero is shown as 0.000 (never "−0.000").
export function formatComplex({re, im}) {
    const a = re.toFixed(3);
    const b = Math.abs(im).toFixed(3);
    const real = Number(a) === 0 ? "0.000" : a.replace("-", "−");
    //the sign of the imaginary part decides between "+" and "−" (rounded zero counts as +)
    const minus = im < 0 && Number(b) !== 0;
    return `${real} ${minus ? "−" : "+"} ${b}i`;
}

//A 3D vector as text: "(−0.200, 0.600, 0.200)". Same rules as formatComplex (3 decimals, a real
//minus sign, a value that rounds to zero is shown as 0.000).
export function formatVec3(x, y, z) {
    const part = (v) => {
        const a = v.toFixed(3);
        return Number(a) === 0 ? "0.000" : a.replace("-", "−");
    };
    return `(${part(x)}, ${part(y)}, ${part(z)})`;
}

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

//The floor of the sample distance of the shader's normal (see march.normalFloor in bulbRenderer.js)
const BULB_NORMAL_FLOOR = 2.0e-7;
export const FRACTALS = {
    julia: {
        name: "Julia",
        //fills out.iter / out.smooth for one point of the complex plane
        //(state is passed in so each fractal can pick the parameters it needs, e.g. state.c)
        iterate: (zx, zy, state, maxIter, out) => julia(zx, zy, state.c, state.power, maxIter, out),
        //Julia: c is the constant, the pixel is the starting point
        defaults: { c: { re: -0.7, im: 0.27015 }, center: { re: 0, im: 0 }, zoom: 300 },
        kind: "julia",
        partner: "mandelbrot",
        formula: (s) => ({title: "Julia", eq: `z → z${formatPower(s.power)} + c`, vars: `z₀ = pixel · c = ${formatComplex(s.c)}`}),
        //z -> z^n + c, starting at the pixel
        glsl: {
            init: "z = p; k = uC;",
            step: "z = cpow(z, uPower) + k;",
        },
        glslDD: {
            init: "Z = P; K = C;",
            step: "Z = cdAdd(cdPowInt(Z, uPowerInt), K);",
        },
    },
    mandelbrot: {
        name: "Mandelbrot",
        //here state.c is the starting point z0 and the pixel is the constant
        iterate: (zx, zy, state, maxIter, out) => mandelbrot(zx, zy, state.c, state.power, maxIter, out),
        //the set spans about re -2..0.5, so centre on -0.5
        defaults: { c: { re: 0, im: 0 }, center: { re: -0.5, im: 0 }, zoom: 300 },
        kind: "mandelbrot",
        partner: "julia", //the inset and click-to-jump use the Julia type
        formula: (s) => ({title: "Mandelbrot", eq: `z → z${formatPower(s.power)} + p`, vars: `p = pixel · z₀ = ${formatComplex(s.c)}`}),
        //z -> z^n + p, starting at the mouse-controlled uC
        glsl: {
            init: "z = uC; k = p;",
            step: "z = cpow(z, uPower) + k;",
        },
        glslDD: {
            init: "Z = C; K = P;",
            step: "Z = cdAdd(cdPowInt(Z, uPowerInt), K);",
        },
    },
    burningShip: {
        name: "Burning Ship",
        iterate: (zx, zy, state, maxIter, out) => burningShip(zx, zy, state.c, state.power, maxIter, out),
        //screen y points down, which shows the ship upright; centred on the main hull
        defaults: { c: { re: 0, im: 0 }, center: { re: -0.4, im: -0.5 }, zoom: 250 },
        kind: "mandelbrot",
        partner: "burningShipJulia",
        formula: (s) => ({title: "Burning Ship", eq: `z → (|Re z| + i|Im z|)${formatPower(s.power)} + p`, vars: `p = pixel · z₀ = ${formatComplex(s.c)}`}),
        //same as Mandelbrot, with abs() of both parts before the power
        glsl: {
            init: "z = uC; k = p;",
            step: "z = cpow(abs(z), uPower) + k;",
        },
        glslDD: {
            init: "Z = C; K = P;",
            step: "Z = cdAdd(cdPowInt(cdAbs(Z), uPowerInt), K);",
        },
    },
    burningShipJulia: {
        name: "Burning Ship Julia",
        iterate: (zx, zy, state, maxIter, out) => burningShipJulia(zx, zy, state.c, state.power, maxIter, out),
        //c is a point inside the Burning Ship's main body, so the set is connected
        defaults: { c: { re: -0.5, im: -0.5 }, center: { re: 0, im: 0 }, zoom: 300 },
        kind: "julia",
        partner: "burningShip",
        formula: (s) => ({title: "Burning Ship Julia", eq: `z → (|Re z| + i|Im z|)${formatPower(s.power)} + c`, vars: `z₀ = pixel · c = ${formatComplex(s.c)}`}),
        //like Julia (constant uC, start at the pixel) with abs() before the power
        glsl: {
            init: "z = p; k = uC;",
            step: "z = cpow(abs(z), uPower) + k;",
        },
        glslDD: {
            init: "Z = P; K = C;",
            step: "Z = cdAdd(cdPowInt(cdAbs(Z), uPowerInt), K);",
        },
    },
    //3D BULBS. These two are raymarched (bulbRenderer.js), so they need no iterate / glsl.
    //
    //MANDELBULB: the 3D analogue of the Mandelbrot set. A point is a 3D vector v, and the step is
    //    v -> v^n + p        (n = state.power, 8 for the classic bulb)
    //where v^n is the "3D power" explained in bulbRenderer.js and p is the point of space being
    //tested. v starts at the mouse-controlled constant (c.re, c.im, cz), which is (0, 0, 0) for
    //the classic bulb, exactly like state.c is z0 on the 2D Mandelbrot.
    //JULIABULB: its Julia counterpart. The step is the same,
    //    v -> v^n + c3       with c3 = (c.re, c.im, cz)
    //but v STARTS at the point of space being tested and c3 is fixed.
    //
    //glsl3d tells the shared distance estimator (de() in bulbRenderer.js) which one it is:
    //  init   -> declares v (the current vector) and k (the vector added each step), from pos
    //            (the point of space) and uC3 (the constant)
    //  drPlus -> what is added to the running derivative dr every step: 1 for the Mandelbulb
    //            (p moves with the point, so d(v0)/d(pos) = 0 and the step contributes +1),
    //            0 for the Juliabulb (the constant does not depend on the point)
    mandelbulb: {
        name: "Mandelbulb",
        render: "raymarch",
        needsWebGL: true,
        formula: (s) => ({title: "Mandelbulb", eq: `v → v${formatPower(s.power)} + p (power in spherical coords)`, vars: `p = 3D point · v₀ = ${formatVec3(s.c.re, s.c.im, s.cz)}`}),
        defaults: { c: { re: 0, im: 0 }, cz: 0, power: 8, cam: { yaw: 0.6, pitch: 0.35, dist: 3.0 } },
        glsl3d: {
            init: "vec3 v = uC3; vec3 k = pos;",
            drPlus: "1.0",
        },
        march: { normalFloor: BULB_NORMAL_FLOOR },
        deJS: (x, y, z, state) => bulbDE(x, y, z, state, false),
    },
    juliabulb: {
        name: "Juliabulb",
        render: "raymarch",
        needsWebGL: true,
        formula: (s) => ({title: "Juliabulb", eq: `v → v${formatPower(s.power)} + c`, vars: `v₀ = 3D point · c = ${formatVec3(s.c.re, s.c.im, s.cz)}`}),
        //c = (-0.2, 0.6, 0.2): a distance-estimator check (Python port of the shader) shows a solid,
        //bumpy surface that fills the default view, so the picture is not empty
        defaults: { c: { re: -0.2, im: 0.6 }, cz: 0.2, power: 8, cam: { yaw: 0.6, pitch: 0.35, dist: 3.0 } },
        glsl3d: {
            init: "vec3 v = pos; vec3 k = uC3;",
            drPlus: "0.0",
        },
        march: { normalFloor: BULB_NORMAL_FLOOR },
        deJS: (x, y, z, state) => bulbDE(x, y, z, state, true),
    },
    //MANDELBOX: a 3D fractal made of FOLDS instead of powers. Each step takes the point z and
    //  1. BOX FOLD:    every coordinate is mirrored back into the box -1..1. A coordinate beyond
    //                  +1 is reflected about +1 (z -> 2 - z), one beyond -1 about -1 (z -> -2 - z).
    //                  That is clamp(z, -1, 1) * 2 - z. The space is folded like paper along the
    //                  six faces of a cube, so the shape inside the box repeats outside it.
    //  2. SPHERE FOLD: a point inside a sphere is pushed outwards: very close to the centre
    //                  (r^2 < 0.25) it is scaled up by a fixed factor, between r^2 = 0.25 and 1
    //                  it is INVERTED (z -> z / r^2, the point goes to the same direction at the
    //                  distance 1/r). Inversion turns the inside of a ball inside out, which
    //                  makes the bubbles and curved halls.
    //  3. SCALE AND TRANSLATE: z -> scale * z + p. The scale stretches the folded space and
    //                  p (the point being tested) is added back, exactly like the "+ c" of the
    //                  2D Mandelbrot. A negative scale also flips the space, which gives the
    //                  most architectural look; the classic boxes use -1.5 or 2.
    //The 3D constant (c.re, c.im, cz) is added as well (uC3): 0 is the classic Mandelbox, other
    //values warp it, so the mouse / "c z" morph it just like the bulbs.
    mandelbox: {
        name: "Mandelbox",
        render: "raymarch",
        needsWebGL: true,
        camera: "fly",
        formula: (s) => ({title: "Mandelbox", eq: "z → s·fold(z) + p", vars: `s = ${s.scale.toFixed(2).replace("-", "−")} · fold = box + sphere fold · p = 3D point`}),
        //start OUTSIDE (at z = 7, yaw = pi looks towards -z, at the structure around the origin);
        //milestone18_check.py verifies that DE > 0 there and that most of the view hits the box
        defaults: { c: { re: 0, im: 0 }, cz: 0, scale: -1.5, camFly: { pos: [0, 0, 7], yaw: Math.PI, pitch: 0, speed: 1 } },
        //steps 192: the folded space needs more steps than the bulbs. bound 0: NO bounding sphere,
        //the camera is often inside the box and its size depends on the scale. far 60: a ray that
        //travels farther has missed. fog 0.05: distant parts fade into the background, which gives
        //depth. trapScale 4: the orbit trap of the box varies little (about 4..6), so it is
        //stretched to cover a good part of the hue wheel. iterCap 24: see the loop in de().
        march: { steps: 192, bound: 0.0, far: 60.0, fog: 0.05, trapScale: 4.0, iterCap: 24 },
        deJS: mandelboxDE,
        glsl3d: {
            uniforms: `uniform float uScale;      // the Mandelbox scale (state.scale)
uniform int uIterCap;      // the most folds of the Mandelbox estimator (march.iterCap)`,
            defines: `#define MIN_R2 0.25
#define FIXED_R2 1.0`,
            //MIN_R2 / FIXED_R2 / ITER_CAP are #defined by the shader template.
            de: `
float de(vec3 pos, out float trap) {
    vec3 z = pos;
    float dr = 1.0;   // |dz / dpos|: how much the folds and scales have stretched space so far
    trap = 1.0e10;
    // More than about 24 folds adds nothing you can see (the later steps only change the point
    // far below a pixel), so the loop is capped (a constant bound, as GLSL ES 1.00 needs). Not
    // lower, though: with 20 the estimate was too big near the surface and rays stepped into the
    // solid (about 8% of test rays at scale -1.5; with 24 it is under 1%), because an orbit that
    // has not yet escaped makes |z| / |dr| overshoot. The iterations slider (uMaxIter) can lower it.
    for (int i = 0; i < ITER_CAP; i++) {
        if (i >= uMaxIter || i >= uIterCap) break;
        // 1. box fold: mirror each coordinate back into -1..1
        z = clamp(z, -1.0, 1.0) * 2.0 - z;
        // 2. sphere fold. A fold only moves the point (it keeps lengths, except this one that
        // scales by a known factor), so the derivative dr just gets the same factor.
        float r2 = dot(z, z);
        if (r2 < MIN_R2) {
            // very close to the centre: scale up by FIXED_R2 / MIN_R2 (linear, so the inversion's
            // blow-up at r -> 0 is avoided)
            z *= FIXED_R2 / MIN_R2;
            dr *= FIXED_R2 / MIN_R2;
        } else if (r2 < FIXED_R2) {
            // inversion in the sphere of radius 1: z / r^2 (the length becomes 1 / r)
            z *= FIXED_R2 / r2;
            dr *= FIXED_R2 / r2;
        }
        // 3. scale and translate: the "z -> s*z + p" of the iteration (+ the morph constant)
        z = uScale * z + pos + uC3;
        dr = dr * abs(uScale) + 1.0;
        trap = min(trap, dot(z, z));
    }
    // Why length(z) / |dr|: after n steps z is (nearly) a linear function of the starting point,
    // z ~ dr * pos, because every fold is either a mirror (length 1) or a scale whose factor dr
    // collects. So when the point moves by d, z moves by about |dr| * d. The surface is where z
    // stays bounded, so the distance to it is about |z| / |dr| (a point that has flown far away
    // after being stretched by |dr| is only that much closer to the surface in real space).
    return length(z) / abs(dr);
}
`,
        },
    },
    //PSEUDO-KLEINIAN (Knighty's fractal, as in Fragmentarium): endless organic caves, canyons and
    //landscape-like structures, the "giant landscape" to fly through. Like the Mandelbox it is built
    //from FOLDS, and each step does two things to the point p:
    //  1. BOX FOLD:         p -> 2*clamp(p, -size, size) - p. Each coordinate beyond the box is
    //                       mirrored back into it, so the space is folded like paper and the shape
    //                       inside the box repeats outside it. The box is CSize = (0.92, 0.91, 0.92)
    //                       times the Box size slider (state.kleinSize).
    //  2. SPHERE INVERSION: a point INSIDE the unit sphere is moved to p / |p|^2 (the same direction,
    //                       the distance 1/r), which turns the inside of the ball inside out; outside
    //                       the sphere nothing happens. The folds and inversions bend the flat mirrored
    //                       planes into the round caves and arches.
    //  Then the 3D constant (c.re, c.im, cz) is added (0 = the classic shape, other values warp it).
    //THE FINAL DISTANCE. The surface is not "where the orbit stays bounded" like the bulbs: after the
    //folds, the fractal is a THICKENED PLANE. A point p ends up near a surface when it is near the
    //infinite cylinder around the z axis (rxy = length(p.xy) close to 0.92784 = the thickness) or near
    //the z = 0 plane (abs(rxy*p.z)/|p| is the distance to a cone-like shape around it). Taking the max of
    //the two gives the thick slab, and dividing by DEfactor (how much the inversions stretched space,
    //tracked in the loop) turns that distance in folded space back into a distance in real space.
    //HEADLIGHT. The caves are dark places and the fixed sun would leave most walls black, so the light
    //is mostly moved to the camera (march.headlight 0.6): the walls you look at are lit, like a lamp
    //on a helmet.
    kleinian: {
        name: "Kleinian",
        render: "raymarch",
        needsWebGL: true,
        camera: "fly",
        formula: (s) => ({title: "Kleinian", eq: "p → k·fold(p) + c", vars: `fold = box fold · k = sphere inversion · box size = ${s.kleinSize.toFixed(3)}`}),
        //kleinSize: the Box size slider. A change of 0.01 gives a quite different landscape (the folds
        //are very sensitive to the box), which is the fun of it; 0.8..1.15 is the useful range.
        //camFly: a start INSIDE a cavity, looking along an open direction. milestone19_check.py (a Python
        //port of the shader) found it: DE = 0.533 there (the nearest wall is 0.53 away), and 99% of a
        //32 x 24 grid of rays hit a wall within the far distance (a cave with walls to see, not empty
        //space). speed 0.5: the caves are tight, so the start speed is half the Mandelbox's.
        defaults: { c: { re: 0, im: 0 }, cz: 0, kleinSize: 1.0, camFly: { pos: [1.07, -1.6, -1.14], yaw: 0, pitch: -0.1, speed: 0.5 } },
        //steps 192 and bound 0 like the Mandelbox (the camera is inside the shape). far 30: a ray
        //that goes farther has missed. fog 0.09: stronger than the Mandelbox's, distant walls fade into
        //the dark so a cave has depth. trapScale 12: the orbit trap (the smallest |p|^2 after a fold)
        //is about 0.02..0.35 on visible walls, so this spreads it over a good part of the hue wheel.
        //iterCap 14: the Python port shows 12 still overshoots the surface on 1.3% of test rays, 14 on none.
        //headlight 0.6: see above.
        march: { steps: 192, bound: 0.0, far: 30.0, fog: 0.09, trapScale: 12.0, iterCap: 14, headlight: 0.6 },
        deJS: kleinianDE,
        glsl3d: {
            uniforms: `uniform float uKleinSize;   // the Box size slider (state.kleinSize)
uniform int uIterCap;      // the most iterations of the Kleinian estimator (march.iterCap)`,
            //the box (before the Box size multiplier) and the thickness of the slab, see above
            defines: `#define KLEIN_CSIZE vec3(0.92436, 0.90756, 0.92436)
#define KLEIN_THICKNESS 0.92784`,
            de: `
float de(vec3 p, out float trap) {
    vec3 CSize = KLEIN_CSIZE * uKleinSize;   // half the size of the folding box, per axis
    float DEfactor = 1.0;                    // how much the inversions have stretched space so far
    trap = 1.0e10;
    // ITER_CAP is a constant (GLSL ES 1.00 needs constant loop bounds); the slider and march.iterCap lower it.
    for (int i = 0; i < ITER_CAP; i++) {
        if (i >= uMaxIter || i >= uIterCap) break;
        // 1. box fold: mirror every coordinate back into -CSize..CSize
        p = 2.0 * clamp(p, -CSize, CSize) - p;
        // 2. sphere inversion, only inside the unit sphere: p / r^2 is the same direction at the
        // distance 1 / r. k = 1 outside it (nothing happens). r2 is kept off 0 so 1 / r2 stays finite.
        float r2 = max(dot(p, p), 1.0e-12);
        trap = min(trap, r2);
        float k = max(1.0 / r2, 1.0);
        p *= k;
        DEfactor *= k;   // the inversion stretches space by k, so distances shrink by k
        // 3. the offset (mouse / c z): 0 gives the classic shape
        p += uC3;
    }
    // The final distance: a thickened plane (see the Kleinian entry in fractals.js). The max of
    // "outside the cylinder of radius KLEIN_THICKNESS around the z axis" and "away from the cone
    // around z = 0", divided by DEfactor to get back to real space. length(p) is kept off 0.
    float rxy = length(p.xy);
    return max(rxy - KLEIN_THICKNESS, abs(rxy * p.z) / max(length(p), 1.0e-12)) / DEfactor;
}
`,
        },
    },
};

//The BULB distance estimator in JavaScript doubles: the SAME maths as the shared GLSL de() built in
//bulbRenderer.js (keep them in sync). The cursor picking of the zoom (pick.js) runs it on the CPU.
//  julia  false = Mandelbulb: v starts at the constant (c.re, c.im, cz), k = the point, drPlus 1
//         true  = Juliabulb:  v starts at the point, k = the constant, drPlus 0
//state needs power, c, cz and maxIter. The iteration cap (64) and the bailout (2) are the shader's.
const BULB_ITER_CAP = 64;
export function bulbDE(x, y, z, state, julia) {
    const n = state.power;
    const drPlus = julia ? 0 : 1;
    const cx = state.c.re, cy = state.c.im, cz = state.cz;
    const kx = julia ? cx : x, ky = julia ? cy : y, kz = julia ? cz : z;
    let vx = julia ? x : cx, vy = julia ? y : cy, vz = julia ? z : cz;
    let dr = 1.0;
    let r = Math.hypot(vx, vy, vz);
    const iters = Math.min(BULB_ITER_CAP, state.maxIter);
    for (let i = 0; i < iters; i++) {
        if (r > 2.0) break; //escaped: the bailout radius
        if (r > 0.0) {
            dr = n * Math.pow(r, n - 1.0) * dr + drPlus;
            //acos wants -1..1: clamp, as the shader does
            const theta = Math.acos(Math.max(-1, Math.min(1, vz / r)));
            //atan2(0, 0) has no angle: use 0, as the shader does
            const phi = (vx === 0 && vy === 0) ? 0 : Math.atan2(vy, vx);
            const nt = n * theta, np = n * phi;
            const rn = Math.pow(r, n);
            vx = rn * Math.sin(nt) * Math.cos(np) + kx;
            vy = rn * Math.sin(nt) * Math.sin(np) + ky;
            vz = rn * Math.cos(nt) + kz;
        } else {
            dr = drPlus;
            vx = kx; vy = ky; vz = kz;
        }
        r = Math.hypot(vx, vy, vz);
    }
    //the same floors as the shader: r off 0 for log(), dr off 0 for the division
    const rr = Math.max(r, 1.0e-6);
    return 0.5 * Math.log(rr) * rr / Math.max(dr, 1.0e-6);
}

//The Kleinian distance estimator in JavaScript doubles: the SAME maths as the GLSL de() above (keep
//them in sync). state needs kleinSize, c, cz and maxIter.
const KLEIN_CSIZE = [0.92436, 0.90756, 0.92436];
const KLEIN_THICKNESS = 0.92784;
export function kleinianDE(x, y, z, state) {
    const sx = KLEIN_CSIZE[0] * state.kleinSize, sy = KLEIN_CSIZE[1] * state.kleinSize, sz = KLEIN_CSIZE[2] * state.kleinSize;
    const cx = state.c.re, cy = state.c.im, cz = state.cz;
    const iters = Math.min(FRACTALS.kleinian.march.iterCap, state.maxIter); //the same cap as the shader's uIterCap
    let factor = 1.0;
    for (let i = 0; i < iters; i++) {
        //box fold: 2 * clamp(p, -size, size) - p
        x = 2 * Math.max(-sx, Math.min(sx, x)) - x;
        y = 2 * Math.max(-sy, Math.min(sy, y)) - y;
        z = 2 * Math.max(-sz, Math.min(sz, z)) - z;
        //sphere inversion inside the unit sphere
        const r2 = Math.max(x*x + y*y + z*z, 1e-12);
        const k = Math.max(1 / r2, 1);
        x *= k; y *= k; z *= k; factor *= k;
        x += cx; y += cy; z += cz;
    }
    const rxy = Math.hypot(x, y);
    return Math.max(rxy - KLEIN_THICKNESS, Math.abs(rxy * z) / Math.max(Math.sqrt(x*x + y*y + z*z), 1e-12)) / factor;
}

//The Mandelbox distance estimator in JavaScript doubles: the SAME maths as the GLSL de() above
//(keep them in sync). It is the Mandelbox's deJS: the fly camera calls it (through the registry) to
//know how far the nearest surface is, for its adaptive speed and collision (inputs.js). state needs
//scale, c, cz and maxIter.
const MIN_R2 = 0.25;
const FIXED_R2 = 1.0;
export function mandelboxDE(x, y, z, state) {
    const px = x, py = y, pz = z;
    const s = state.scale;
    const cx = state.c.re, cy = state.c.im, cz = state.cz;
    const iters = Math.min(FRACTALS.mandelbox.march.iterCap, state.maxIter); //the same cap as the shader's uIterCap
    let dr = 1.0;
    for (let i = 0; i < iters; i++) {
        //box fold: clamp(z, -1, 1) * 2 - z
        x = Math.max(-1, Math.min(1, x)) * 2 - x;
        y = Math.max(-1, Math.min(1, y)) * 2 - y;
        z = Math.max(-1, Math.min(1, z)) * 2 - z;
        //sphere fold
        const r2 = x*x + y*y + z*z;
        if (r2 < MIN_R2) {
            const f = FIXED_R2 / MIN_R2;
            x *= f; y *= f; z *= f; dr *= f;
        } else if (r2 < FIXED_R2) {
            const f = FIXED_R2 / r2;
            x *= f; y *= f; z *= f; dr *= f;
        }
        //scale and translate
        x = s * x + px + cx;
        y = s * y + py + cy;
        z = s * z + pz + cz;
        dr = dr * Math.abs(s) + 1.0;
    }
    return Math.sqrt(x*x + y*y + z*z) / Math.abs(dr);
}

//true for the 3D types (the ones rendered by raymarching, not per point of the plane)
export function isRaymarch(key) {
    return getFractal(key).render === "raymarch";
}

//true for the raymarched types that are flown with the WASD camera (the Mandelbox) instead of
//orbited (the bulbs)
export function isFly(key) {
    return getFractal(key).camera === "fly";
}

//Looks a fractal up by key. Unknown or missing keys fall back to Julia
//so a bad state value can never break drawing.
export function getFractal(key){
    return FRACTALS[key] || FRACTALS.julia;
}
