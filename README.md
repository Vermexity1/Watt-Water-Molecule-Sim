# Molecular Thermodynamics Lab

A browser-based 2D molecular dynamics and thermodynamics lab simulation built with plain HTML, CSS, and JavaScript Canvas.

## What this project includes

- Lennard-Jones intermolecular forces with a cutoff radius
- Velocity Verlet time integration
- Real-time temperature, kinetic energy, potential energy, and total energy tracking
- Reflective and periodic boundary conditions
- Bulk heat transfer through a virtual cup wall
- Multiple insulation materials: Styrofoam, Plastic, Glass, and Metal
- Environment presets with adjustable ambient temperature and environmental coupling
- Local heat and cold tools for interactive experimentation
- Trial logging for comparing insulation performance
- Educational overlays written for strong middle school science students

## Project structure

- `index.html`: application layout and UI markup
- `css/styles.css`: visual design and responsive layout
- `js/config.js`: simulation constants, materials, presets, and defaults
- `js/utils.js`: shared helper functions
- `js/models/Particle.js`: particle data model
- `js/core/PhysicsEngine.js`: molecular dynamics, force calculation, and integration
- `js/core/ThermodynamicsEngine.js`: heat transfer, thermostat behavior, and local heating/cooling zones
- `js/core/GraphBuffer.js`: graph history storage
- `js/ui/Renderer.js`: simulation and graph drawing
- `js/ui/UIController.js`: controls, labels, and table updates
- `js/app.js`: application bootstrap and animation loop
- `server.js`: lightweight local static server with no external dependencies

## How to run

### Recommended method

1. Open a terminal in `C:\Users\prave\Downloads\Water Simulation`
2. Run:

```powershell
npm start
```

3. Open this address in your browser:

```text
http://127.0.0.1:8080
```

### Alternative method

If you already have Python installed, you can also run:

```powershell
python -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080
```

## Suggested classroom workflow

1. Keep the starting fluid temperature fixed.
2. Test each cup material one at a time.
3. Let the system run for the same amount of time.
4. Record trials and compare delta temperature, heat loss, cooling rate, and insulation score.
5. Ask students to explain the macroscopic results using particle motion and conductivity.

## Notes on the science model

- The simulation is educational rather than laboratory-certified.
- Phase behavior is inferred from particle speed and clustering instead of being manually assigned.
- The thermal model couples microscopic motion to a bulk heat-transfer layer so students can connect particle dynamics with observable thermodynamics.
