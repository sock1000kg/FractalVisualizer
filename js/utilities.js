//Returns number of iterations for a point to escape
export function julia(zx, zy, c, maxIter) {

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

//Color handling
export function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c/2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60)         [r, g, b] = [c, x, 0];
    else if (60 <= h && h < 120)  [r, g, b] = [x, c, 0];
    else if (120 <= h && h < 180) [r, g, b] = [0, c, x];
    else if (180 <= h && h < 240) [r, g, b] = [0, x, c];
    else if (240 <= h && h < 300) [r, g, b] = [x, 0, c];
    else if (300 <= h && h < 360) [r, g, b] = [c, 0, x];

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}
