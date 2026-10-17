// Fractal registry.
// To add a new fractal: write its escape-time function below, then add ONE
// entry to FRACTALS. draw.js only talks to the registry, so nothing else
// needs to change.

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

export const FRACTALS = {
    julia: {
        name: "Julia",
        //returns the escape iteration count for one point of the complex plane
        //(state is passed in so each fractal can pick the parameters it needs, e.g. state.c)
        iterate: (zx, zy, state, maxIter) => julia(zx, zy, state.c, maxIter),
    },
};

//Looks a fractal up by key. Unknown or missing keys fall back to Julia
//so a bad state value can never break drawing.
export function getFractal(key){
    return FRACTALS[key] || FRACTALS.julia;
}
