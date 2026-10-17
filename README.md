# Fractal Visualizer
*(English | [Tiếng Việt](./README.vi.md))*

[Live Demo](https://sock1000kg.github.io/FractalVisualizer/)

Fractal Visualizer is a CPU-based fractal visualizer built with HTML5 and JavaScript using the Julia set. Explore a wide variety of mesmerizing patterns, zoom in to discover intricate details, and save your favorite fractals. Customize colors, coordinates, and more in the advanced settings to unleash your creativity. Have fun :)

## Features
- Interactive fractal drawing using mouse position and hue shifts
- Zoom: the field shows a magnification (1× = the default view of each type), up to 10¹⁵× on the CPU renderer. The mouse wheel zooms toward the cursor, and you can type a value such as `2.5` or `1e9` in the field (scientific notation is accepted). A warning line appears when the zoom passes what the current renderer can draw accurately: about 10¹¹× on WebGL for whole-number powers (it does the maths in emulated double precision once you pass 10⁴×), about 10⁵× on WebGL for fractional powers, and 10¹³× on the CPU. For the very deepest views use `?renderer=cpu`
- Iterations up to 5000 (logarithmic slider) and an "Auto iterations" option that raises the count as you zoom in
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
- Linked preview (two-way): on Mandelbrot and Burning Ship a small inset shows the Julia set for the point under the cursor (or finger). On the Julia types the inset shows the partner Mandelbrot / Burning Ship set with a crosshair at the current c ("you are here"). Click the canvas to pin the inset at that point (Mandelbrot types; click again or press Esc to unpin) or to freeze c (Julia types; same as P), then click or tap the inset itself to open it: from a Julia set you land on the Mandelbrot centred on c, with a "c" crosshair marking where you came from (it flashes for about 2 seconds, then fades out); from a Mandelbrot the pinned (or last hovered) point becomes the Julia constant. The Mandelbrot inset is a map of all c values, so its image never changes with c; the ✛ marks the p that equals your c. Burning Ship has its own "Burning Ship Julia" type. Tip: press P to freeze the morphing, then hover to explore. The inset can be turned off with the preview checkbox in Advanced Controls (its label names the partner, e.g. "Julia preview"; it is hidden for types without a partner)
- 3D terrain: the **3D** button shows the current view as a lit landscape (the smooth escape value is the height; the points inside the set form a flat plateau). Drag to orbit the camera, Ctrl + middle-drag to move the camera (orbiting then turns around the new point), Shift-drag or right-drag to pan the fractal region, the wheel zooms the fractal (with Auto iterations), Ctrl + wheel changes the camera distance, and the Height slider in Advanced Controls scales the hills (Reset camera restores the default angle). Hovering still morphs c. On touch, one finger orbits and two fingers pinch-zoom and pan. The preview inset, markers and pin are hidden in 3D. It needs WebGL (the button is disabled on the CPU renderer) and uses plain floats, so it is accurate up to about 10⁵×
- 3D Mandelbulb and Juliabulb: two extra types in the type selector, drawn by raymarching a distance estimator in a fragment shader (lit, with ambient occlusion). The **Mandelbulb** is the 3D analogue of the Mandelbrot set (Power 8 is the classic bulb); the **Juliabulb** is its Julia counterpart with a 3D constant. Drag to orbit, Ctrl + middle-drag to move the camera, the wheel changes the camera distance (the zoom field shows the magnification), hovering sets c (press P to freeze), and the **c z** slider in Advanced Controls sets the third component of c. The Power slider (2 to 8, fractions allowed), Iterations (capped at 64 for the bulbs), the colour settings and the B&W / Simple modes all apply; Reset camera restores the view. On touch, one finger orbits and two fingers pinch to change the distance. They need WebGL (the options are disabled on the CPU renderer) and have no preview inset. Switching back to a 2D type puts the Power back to 2
- 3D Mandelbox: a third raymarched type, made of folds (a box fold and a sphere fold) instead of powers, so it looks like giant alien architecture, especially from inside. It is the only type with a **fly camera**: WASD or the arrow keys move, Q/E go down/up, drag to look around, the wheel sets the speed and Shift boosts it. The speed adapts to the distance from the nearest surface, so you slow down near walls (you cannot pass through them) and speed up in open space, and can fly from outside right into tiny detail. The **Scale** slider in Advanced Controls (-3 to 3) changes the structure drastically (try -1.5, 2 and -2.5), c and **c z** morph it, and the colour settings, B&W / Simple and Reset camera work. Tip: fly inside at scale -1.5. Keys are ignored while typing in a field. On touch, one finger looks, a pinch flies forward/back and two fingers strafe. Needs WebGL (disabled on the CPU renderer); a warning shows when you get closer to a surface than the GPU's floats can resolve
- Equations: a line under the controls bar shows the equation of the current view with live values, and the inset has its own caption. z is the number being iterated, n the Power (shown as a superscript, or ^2.5 for fractions), z₀ the starting value, c the constant of a Julia set and p the pixel used as the constant on Mandelbrot types. On a Mandelbrot type the pixel is the constant p; on a Julia type the pixel is the start z₀ and c comes from the mouse

## Performance

The page asks the browser for the high-performance GPU, but this is only a hint. On a laptop with two GPUs on Windows, set it yourself: Settings → Display → Graphics → add your browser → Options → High performance, then restart the browser. Open `chrome://gpu` (or look for the `GPU:` line in the console) to check which GPU is in use.

## Screenshots
<img width="1920" height="1080" alt="Funky Pink" src="https://github.com/user-attachments/assets/2ff3a9d5-3f40-4ecb-b6bc-1a14bc7c04e4" />
<img width="1229" height="691" alt="fractal" src="https://github.com/user-attachments/assets/026eace9-b995-48d4-9472-30d1eff6de41" />
<img width="1920" height="1080" alt="Snow Chaos" src="https://github.com/user-attachments/assets/0005908d-0726-4d1a-ba04-2246f390eb75" />
<img width="1222" height="591" alt="fractal (3)" src="https://github.com/user-attachments/assets/a097a270-3e62-477f-b95f-00eecbc2373a" />
<img width="1222" height="591" alt="fractal (2)" src="https://github.com/user-attachments/assets/c870d404-6249-4a46-97b8-140778677db8" />

## Credits
I saw Carter Semrad's "I coded one project EVERY WEEK for a YEAR" and was very inspired and curious about his fractal generation project, so I decided to try and build one from scratch with my own added features.
