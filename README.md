# Fractal Visualizer
*(English | [Tiếng Việt](./README.vi.md))*

[Live Demo](https://sock1000kg.github.io/FractalVisualizer/)

Fractal Visualizer is a CPU-based fractal visualizer built with HTML5 and JavaScript using the Julia set. Explore a wide variety of mesmerizing patterns, zoom in to discover intricate details, and save your favorite fractals. Customize colors, coordinates, and more in the advanced settings to unleash your creativity. Have fun :)

## Features
- Interactive fractal drawing using mouse position and hue shifts
- Zoom
- Black and White mode
- Download fractal images
- Save and delete presets
- Simple mode for lower performace machines
- Control the fractal's depth (the number of iterations), Saturation, Lightness
- Different types of fractals: Julia, Mandelbrot and Burning Ship (for Mandelbrot and Burning Ship the mouse sets the starting point)
- WebGL based rendering (reduces lag). Falls back to the CPU renderer if WebGL is unavailable; add `?renderer=cpu` to the URL to force the CPU renderer
- Touch support for phones and tablets: one finger moves the constant c (or pans while paused), two fingers pinch-zoom and pan at the same time
- Smooth colouring: a Smoothness slider removes the colour bands (100 = fully smooth, 0 = the classic banded look)
- Power: a Power slider (2 to 8) changes the formula from z² to zⁿ for every fractal type, e.g. Julia gets n-fold symmetry and Mandelbrot gets n−1 lobes. Fractional powers show a straight seam, that's expected

## Screenshots
<img width="1920" height="1080" alt="Funky Pink" src="https://github.com/user-attachments/assets/2ff3a9d5-3f40-4ecb-b6bc-1a14bc7c04e4" />
<img width="1229" height="691" alt="fractal" src="https://github.com/user-attachments/assets/026eace9-b995-48d4-9472-30d1eff6de41" />
<img width="1920" height="1080" alt="Snow Chaos" src="https://github.com/user-attachments/assets/0005908d-0726-4d1a-ba04-2246f390eb75" />
<img width="1222" height="591" alt="fractal (3)" src="https://github.com/user-attachments/assets/a097a270-3e62-477f-b95f-00eecbc2373a" />
<img width="1222" height="591" alt="fractal (2)" src="https://github.com/user-attachments/assets/c870d404-6249-4a46-97b8-140778677db8" />

## Credits
I saw Carter Semrad's "I coded one project EVERY WEEK for a YEAR" and was very inspired and curious about his fractal generation project, so I decided to try and build one from scratch with my own added features.
