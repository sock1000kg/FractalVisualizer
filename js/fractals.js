// Fractal registry.
// To add a new fractal: write its escape-time function below, then add ONE
// entry to FRACTALS. draw.js only talks to the registry, so nothing else
// needs to change.
//
// Entry shape:
//   name:    text shown in the type selector
//   iterate: (zx, zy, state, maxIter) => escape iteration count for one point
//   defaults: the view we jump to when this type is selected
//     c      -> starting value of state.c (the mouse-controlled parameter)
//     center -> complex point shown in the middle of the screen
//     zoom   -> pixels per unit of the complex plane
//   glsl:    the same fractal written as two GLSL snippets for the WebGL renderer
//     init -> sets the starting z and the constant k, from p (the pixel as a
//             complex number) and uC (state.c)
//     step -> one iteration, updating z
//     Keep these in sync with the iterate function above.

//Returns number of iterations for a point to escape
//z = zx + i*zy
function julia(zx, zy, c, maxIter) {

    let x = zx, y = zy, iter = 0;
    while (x*x + y*y < 4 && iter < maxIter) {
      //z^2
      let xtemp = x*x - y*y + c.re;
      y = 2*x*y + c.im;
      x = xtemp;
      iter++;
    }
    return iter;
}

//Mandelbrot: z -> z^2 + p, where p is the pixel and z starts at z0.
//The classic picture uses z0 = 0. We let the mouse move z0 (state.c) so the
//shape morphs as you move; with c = 0 it is the normal Mandelbrot set.
function mandelbrot(zx, zy, z0, maxIter) {

    let x = z0.re, y = z0.im, iter = 0;
    while (x*x + y*y < 4 && iter < maxIter) {
      //z^2 + p  (p = zx + i*zy is the constant here)
      let xtemp = x*x - y*y + zx;
      y = 2*x*y + zy;
      x = xtemp;
      iter++;
    }
    return iter;
}

//Burning Ship: same as Mandelbrot, but take |x| and |y| before squaring.
//|x| and |y| only matter in the cross term: x^2 and y^2 are already positive,
//and (|x| + i|y|)^2 has imaginary part 2*|x|*|y| = 2*|x*y|.
function burningShip(zx, zy, z0, maxIter) {

    let x = z0.re, y = z0.im, iter = 0;
    while (x*x + y*y < 4 && iter < maxIter) {
      let xtemp = x*x - y*y + zx;
      y = 2*Math.abs(x*y) + zy;
      x = xtemp;
      iter++;
    }
    return iter;
}

export const FRACTALS = {
    julia: {
        name: "Julia",
        //returns the escape iteration count for one point of the complex plane
        //(state is passed in so each fractal can pick the parameters it needs, e.g. state.c)
        iterate: (zx, zy, state, maxIter) => julia(zx, zy, state.c, maxIter),
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
        iterate: (zx, zy, state, maxIter) => mandelbrot(zx, zy, state.c, maxIter),
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
        iterate: (zx, zy, state, maxIter) => burningShip(zx, zy, state.c, maxIter),
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
