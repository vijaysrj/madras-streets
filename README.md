# Madras Streets

An open-world driving game set in the real streets of Besant Nagar and Adyar, Chennai.
Drive an auto, a scooter or a cab, take passengers, run deliveries and try the driving challenges.
No shooting and no crime.

- Map: OpenStreetMap data at true scale (© OpenStreetMap contributors, ODbL).
- Tech: simulation in C compiled to WebAssembly, three.js (WebGL2) for the 3D view, canvas for the HUD.
- The playable game is the single file `dist/index.html`.

## Build

    npm install
    node build.mjs

The build needs `clang` with the wasm32 target for the C simulation.
