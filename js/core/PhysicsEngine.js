import { absoluteToDisplay, clamp, lerp, speed2ToTemperature, speedToNormalized, temperatureToSpeed } from "../utils.js";
import { Particle } from "../models/Particle.js";

export class PhysicsEngine {
  constructor(config, thermo) {
    this.config = config;
    this.thermo = thermo;
    this.particles = [];
    this.bounds = { minX: 60, minY: 55, maxX: 740, maxY: 460 };
    this.visualBounds = { ...this.bounds };
    this.width = 800;
    this.height = 520;
    this.cutoff = 2.5 * config.sigma;
    this.cellSize = this.cutoff;
    this.grid = [];
    this.gridCols = 1;
    this.gridRows = 1;
    this.metrics = {
      temperature: config.temperature,
      kinetic: 0,
      potential: 0,
      total: 0,
      phase: "Liquid-like",
      avgSpeed: 0,
      density: 0
    };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const marginX = Math.max(52, width * 0.065);
    const marginTop = Math.max(58, height * 0.10);
    const marginBottom = Math.max(56, height * 0.11);
    const floorY = height - marginBottom;

    if (this.config.cupPresent) {
      const cupWidth = Math.min(width * 0.46, 420);
      const positions = {
        left: marginX + cupWidth * 0.5 + 20,
        center: width * 0.5,
        right: width - marginX - cupWidth * 0.5 - 20
      };
      const centerX = positions[this.config.cupPlacement] ?? positions.center;
      const outerBounds = {
        minX: centerX - cupWidth * 0.5,
        minY: marginTop + 8,
        maxX: centerX + cupWidth * 0.5,
        maxY: floorY
      };
      const wallInsetX = 22 + this.config.cupThickness * 2.8;
      const wallInsetTop = 20 + this.config.cupThickness * 1.5;
      const wallInsetBottom = 28;
      this.visualBounds = outerBounds;
      this.bounds = {
        minX: outerBounds.minX + wallInsetX,
        minY: outerBounds.minY + wallInsetTop,
        maxX: outerBounds.maxX - wallInsetX,
        maxY: outerBounds.maxY - wallInsetBottom
      };
    } else {
      this.bounds = {
        minX: marginX,
        minY: marginTop + 18,
        maxX: width - marginX,
        maxY: floorY
      };
      this.visualBounds = { ...this.bounds };
    }
  }

  fitParticlesToBounds() {
    for (const particle of this.particles) {
      particle.x = clamp(particle.x, this.bounds.minX, this.bounds.maxX);
      particle.y = clamp(particle.y, this.bounds.minY, this.bounds.maxY);
      particle.prevX = clamp(particle.prevX, this.bounds.minX, this.bounds.maxX);
      particle.prevY = clamp(particle.prevY, this.bounds.minY, this.bounds.maxY);
    }
  }

  reset(config = this.config) {
    this.config = { ...config };
    this.cutoff = 2.5 * this.config.sigma;
    this.cellSize = this.cutoff;
    this.particles = [];
    const startTemperature = this.thermo?.sampleTemperature ?? this.config.temperature;
    this.initializeSampleBlock(startTemperature);

    this.removeDrift();
    this.computeForces();
    this.updateMetrics();
    this.setTemperature(startTemperature);
    this.updateParticleDisplayTemperatures(this.config.dt);
  }

  getArrangementMode(temperature) {
    if (temperature < 273.15) {
      return "solid";
    }
    if (temperature < 373.15) {
      return "liquid";
    }
    return "gas";
  }

  initializeSampleBlock(startTemperature) {
    const sigma = this.config.sigma;
    const speedScale = temperatureToSpeed(startTemperature);
    const width = this.bounds.maxX - this.bounds.minX;
    const left = this.bounds.minX + sigma * 0.9;
    const right = this.bounds.maxX - sigma * 0.9;
    const top = this.bounds.minY + sigma * 1.2;
    const bottom = this.bounds.maxY - sigma * 1.2;
    const spacingProfiles = {
      solid: { x: sigma * 0.84, y: sigma * 0.78, widthFactor: this.config.cupPresent ? 0.62 : 0.48, heightLift: 0 },
      liquid: { x: sigma * 1.26, y: sigma * 1.12, widthFactor: this.config.cupPresent ? 0.74 : 0.62, heightLift: sigma * 4 },
      gas: { x: sigma * 2.9, y: sigma * 2.35, widthFactor: this.config.cupPresent ? 0.9 : 0.88, heightLift: sigma * 10 }
    };
    const arrangementMode = this.getArrangementMode(startTemperature);
    const profile = spacingProfiles[arrangementMode];
    const spacingX = profile.x;
    const spacingY = profile.y;
    const cols = Math.max(8, Math.floor((width * profile.widthFactor) / spacingX));
    const rows = Math.ceil(this.config.particleCount / cols);
    const blockPixelWidth = spacingX * Math.max(1, cols - 1) + spacingX * 0.5;
    const blockPixelHeight = spacingY * Math.max(1, rows - 1);
    const startX = clamp((this.bounds.minX + this.bounds.maxX) * 0.5 - blockPixelWidth * 0.5, left, right - blockPixelWidth);
    const maxStartY = Math.max(top, bottom - blockPixelHeight - profile.heightLift);
    const startY = maxStartY;

    let id = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols && id < this.config.particleCount; col += 1) {
        const offset = row % 2 === 0 ? 0 : spacingX * 0.5;
        const restX = clamp(startX + col * spacingX + offset, left, right);
        const restY = clamp(startY + row * spacingY, top, bottom);
        const jitter = arrangementMode === "gas" ? sigma * 0.42 : arrangementMode === "liquid" ? sigma * 0.18 : sigma * 0.035;
        const x = clamp(restX + (Math.random() - 0.5) * jitter, left, right);
        const y = clamp(restY + (Math.random() - 0.5) * jitter, top, bottom);
        const angle = Math.random() * Math.PI * 2;
        const speedFactor = arrangementMode === "gas" ? 0.94 + Math.random() * 0.12 : arrangementMode === "liquid" ? 0.88 + Math.random() * 0.12 : 0.86 + Math.random() * 0.16;
        const speed = speedScale * speedFactor;
        const particle = new Particle(id, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);
        particle.restX = restX;
        particle.restY = restY;
        particle.instantTemperature = startTemperature;
        particle.displayTemperature = startTemperature;
        this.particles.push(particle);
        id += 1;
      }
    }
  }

  removeDrift() {
    let totalVX = 0;
    let totalVY = 0;
    for (const particle of this.particles) {
      totalVX += particle.vx;
      totalVY += particle.vy;
    }
    const avgVX = totalVX / this.particles.length;
    const avgVY = totalVY / this.particles.length;
    for (const particle of this.particles) {
      particle.vx -= avgVX;
      particle.vy -= avgVY;
    }
  }

  setTemperature(temp) {
    const currentTemp = Math.max(0.3, this.metrics.temperature);
    const factor = Math.sqrt(temp / currentTemp);
    for (const particle of this.particles) {
      particle.vx *= factor;
      particle.vy *= factor;
    }
    this.updateMetrics();
  }

  buildGrid() {
    const width = this.bounds.maxX - this.bounds.minX;
    const height = this.bounds.maxY - this.bounds.minY;
    this.gridCols = Math.max(1, Math.ceil(width / this.cellSize));
    this.gridRows = Math.max(1, Math.ceil(height / this.cellSize));
    this.grid = Array.from({ length: this.gridCols * this.gridRows }, () => []);

    for (const particle of this.particles) {
      const cx = clamp(Math.floor((particle.x - this.bounds.minX) / this.cellSize), 0, this.gridCols - 1);
      const cy = clamp(Math.floor((particle.y - this.bounds.minY) / this.cellSize), 0, this.gridRows - 1);
      this.grid[cy * this.gridCols + cx].push(particle);
      particle.neighbors = 0;
    }
  }

  applyBoundaries(particle) {
    const { minX, minY, maxX, maxY } = this.bounds;
    const width = maxX - minX;
    const height = maxY - minY;

    if (this.config.boundaryMode === "periodic") {
      if (particle.x < minX) {
        particle.x += width;
        particle.prevX += width;
      }
      if (particle.x > maxX) {
        particle.x -= width;
        particle.prevX -= width;
      }
      if (particle.y < minY) {
        particle.y += height;
        particle.prevY += height;
      }
      if (particle.y > maxY) {
        particle.y -= height;
        particle.prevY -= height;
      }
      return;
    }

    // A tiny bit of loss looks better than perfectly elastic math here,
    // but we keep it close enough to 1 so the floor does not behave like a hidden cold plate.
    const restitution = 0.9995;
    if (particle.x < minX) {
      particle.x = minX + (minX - particle.x);
      particle.vx = Math.abs(particle.vx) * restitution;
    }
    if (particle.x > maxX) {
      particle.x = maxX - (particle.x - maxX);
      particle.vx = -Math.abs(particle.vx) * restitution;
    }
    if (particle.y < minY) {
      particle.y = minY + (minY - particle.y);
      particle.vy = Math.abs(particle.vy) * restitution;
    }
    if (particle.y > maxY) {
      particle.y = maxY - (particle.y - maxY);
      particle.vy = -Math.abs(particle.vy) * restitution;
    }
  }

  minimumImage(dx, dy) {
    if (this.config.boundaryMode !== "periodic") {
      return { dx, dy };
    }
    const width = this.bounds.maxX - this.bounds.minX;
    const height = this.bounds.maxY - this.bounds.minY;
    if (dx > width * 0.5) dx -= width;
    if (dx < -width * 0.5) dx += width;
    if (dy > height * 0.5) dy -= height;
    if (dy < -height * 0.5) dy += height;
    return { dx, dy };
  }

  computeForces() {
    const sigma = this.config.sigma;
    const epsilon = this.config.epsilon;
    const sigma2 = sigma * sigma;
    const cutoff = this.cutoff;
    const cutoff2 = cutoff * cutoff;
    const invCutoff2 = sigma2 / cutoff2;
    const invCutoff6 = invCutoff2 * invCutoff2 * invCutoff2;
    const shift = 4 * epsilon * (invCutoff6 * invCutoff6 - invCutoff6);

    this.buildGrid();
    for (const particle of this.particles) {
      particle.fx = 0;
      particle.fy = 0;
    }

    let potential = 0;
    // Only check nearby cells. The full N^2 loop is unnecessary once the cell list is in place.
    const visited = new Set();
    for (let cy = 0; cy < this.gridRows; cy += 1) {
      for (let cx = 0; cx < this.gridCols; cx += 1) {
        const cellIndex = cy * this.gridCols + cx;
        const cellParticles = this.grid[cellIndex];
        const neighborOffsets = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1]
        ];

        for (const [offsetX, offsetY] of neighborOffsets) {
          let nx = cx + offsetX;
          let ny = cy + offsetY;

          if (this.config.boundaryMode === "periodic") {
            nx = (nx + this.gridCols) % this.gridCols;
            ny = (ny + this.gridRows) % this.gridRows;
          } else if (nx < 0 || nx >= this.gridCols || ny < 0 || ny >= this.gridRows) {
            continue;
          }

          const neighborIndex = ny * this.gridCols + nx;
          const key = `${Math.min(cellIndex, neighborIndex)}:${Math.max(cellIndex, neighborIndex)}`;
          if ((offsetX !== 0 || offsetY !== 0) && visited.has(key)) {
            continue;
          }
          if (offsetX !== 0 || offsetY !== 0) {
            visited.add(key);
          }

          const neighborParticles = this.grid[neighborIndex];
          for (let i = 0; i < cellParticles.length; i += 1) {
            const a = cellParticles[i];
            const start = cellParticles === neighborParticles ? i + 1 : 0;
            for (let j = start; j < neighborParticles.length; j += 1) {
              const b = neighborParticles[j];
              let dx = b.x - a.x;
              let dy = b.y - a.y;
              ({ dx, dy } = this.minimumImage(dx, dy));
              const r2 = dx * dx + dy * dy;
              if (r2 <= 0.0001 || r2 > cutoff2) continue;

              const minR2 = Math.max(r2, sigma2 * 0.42);
              const invR2 = sigma2 / minR2;
              const invR6 = invR2 * invR2 * invR2;
              const invR12 = invR6 * invR6;
              const forceScalar = 24 * epsilon * (2 * invR12 - invR6) / minR2 * 0.18;
              const fx = clamp(forceScalar * dx, -280, 280);
              const fy = clamp(forceScalar * dy, -280, 280);

              a.fx -= fx;
              a.fy -= fy;
              b.fx += fx;
              b.fy += fy;
              potential += 4 * epsilon * (invR12 - invR6) - shift;

              if (r2 < (1.35 * sigma) * (1.35 * sigma)) {
                a.neighbors += 1;
                b.neighbors += 1;
              }
            }
          }
        }
      }
    }

    this.thermo.applyForceFields(this.particles, this.bounds, this.metrics.temperature);
    this.applyColdLatticeForces();
    for (const particle of this.particles) {
      particle.ax = particle.fx / particle.mass;
      particle.ay = particle.fy / particle.mass;
    }

    this.metrics.potential = potential;
  }

  applyColdLatticeForces() {
    const targetBase = this.thermo?.sampleTemperature ?? this.metrics.temperature;
    const targetDisplayTemp = absoluteToDisplay(targetBase);
    const displayTemp = absoluteToDisplay(this.metrics.temperature);
    const solidFactor = clamp((-60 - displayTemp) / 120, 0, 1);
    if (solidFactor <= 0) {
      return;
    }

    const heatingRelease = clamp((targetDisplayTemp - 5) / 90, 0, 1);
    const retainedSolidFactor = solidFactor * (1 - heatingRelease * 0.88);
    if (retainedSolidFactor <= 0.01) {
      return;
    }

    const spring = 18 + this.config.epsilon * 8;
    const damping = 0.46 + retainedSolidFactor * 1.15;
    for (const particle of this.particles) {
      particle.fx += (particle.restX - particle.x) * spring * retainedSolidFactor;
      particle.fy += (particle.restY - particle.y) * spring * retainedSolidFactor;
      particle.fx -= particle.vx * damping;
      particle.fy -= particle.vy * (damping + 0.28);
    }
  }

  stabilizeParticleSpeeds() {
    const bulkTemp = Math.max(0.3, this.metrics.temperature);
    const referenceTemp = bulkTemp;
    const displayTemp = absoluteToDisplay(referenceTemp);
    const baseSpeed = temperatureToSpeed(bulkTemp);
    const solidFactor = clamp((-55 - displayTemp) / 120, 0, 1);
    const gasFactor = clamp((displayTemp - 70) / 240, 0, 1);
    const hotFactor = clamp((displayTemp - 70) / 180, 0, 1);
    const maxSpeed = clamp(baseSpeed * (1.85 + gasFactor * 0.35), 7, 60);
    const minVibration = solidFactor > 0 ? 0.05 + solidFactor * 0.06 : 0;
    const solidTargetSpeed = clamp(baseSpeed * (0.10 + (1 - solidFactor) * 0.24), 0.05, 1.45);
    const hotMinSpeed = clamp(baseSpeed * (0.42 + gasFactor * 0.20), 1.6, 38);

    for (const particle of this.particles) {
      const speed = Math.hypot(particle.vx, particle.vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        particle.vx *= scale;
        particle.vy *= scale;
      } else if (hotFactor > 0.2 && speed < hotMinSpeed) {
        const safeSpeed = Math.max(0.0001, speed);
        const liftScale = hotMinSpeed / safeSpeed;
        const blend = clamp(0.12 + hotFactor * 0.18 + gasFactor * 0.10, 0.12, 0.36);
        particle.vx *= lerp(1, liftScale, blend);
        particle.vy *= lerp(1, liftScale, blend);
      } else if (solidFactor > 0.3 && speed < minVibration) {
        const angle = (particle.id * 1.618 + this.metrics.kinetic * 0.001) % (Math.PI * 2);
        particle.vx += Math.cos(angle) * minVibration * 0.16;
        particle.vy += Math.sin(angle) * minVibration * 0.16;
      }

      if (solidFactor > 0.5) {
        const currentSpeed = Math.max(0.0001, Math.hypot(particle.vx, particle.vy));
        const settleFactor = lerp(1, solidTargetSpeed / currentSpeed, 0.18 + solidFactor * 0.28);
        particle.vx *= settleFactor;
        particle.vy *= settleFactor;
        particle.vx *= 1 - solidFactor * 0.08;
        particle.vy *= 1 - solidFactor * 0.12;
      }
    }
  }

  syncSpeedsToBulkTemperature() {
    const targetTemp = Math.max(0.3, this.thermo?.sampleTemperature ?? this.metrics.temperature);
    const phaseState = this.thermo?.phaseState ?? { solid: 0, liquid: 1, gas: 0 };
    let speed2Sum = 0;
    for (const particle of this.particles) {
      speed2Sum += particle.speed2();
    }

    const currentTemp = Math.max(0.3, speed2ToTemperature(speed2Sum / Math.max(1, this.particles.length)));
    const factor = Math.sqrt(targetTemp / currentTemp);
    const syncStrength = clamp(0.18 + phaseState.liquid * 0.04 + phaseState.gas * 0.12 - phaseState.solid * 0.10, 0.08, 0.34);
    const appliedFactor = lerp(1, factor, syncStrength);
    for (const particle of this.particles) {
      particle.vx *= appliedFactor;
      particle.vy *= appliedFactor;
    }
  }

  updateParticleDisplayTemperatures(dt = this.config.dt) {
    const bulkTemp = Math.max(0.3, this.thermo?.sampleTemperature ?? this.metrics.kineticTemperature ?? this.metrics.temperature);
    const phaseState = this.thermo?.phaseState ?? { solid: 0, liquid: 1, gas: 0 };
    const anchorToBulk = clamp(0.80 + phaseState.liquid * 0.06 + phaseState.gas * 0.10 + phaseState.solid * 0.08, 0.80, 0.94);
    const displayBand = clamp(6 + phaseState.liquid * 6 + phaseState.gas * 10 - phaseState.solid * 2, 4, 18);
    const relaxAlpha = clamp(0.16 + phaseState.solid * 0.14 + phaseState.liquid * 0.12 + phaseState.gas * 0.16 + dt * 4, 0.16, 0.42);
    const minDisplayTemp = Math.max(0.3, bulkTemp - displayBand);
    const maxDisplayTemp = bulkTemp + displayBand;

    for (const particle of this.particles) {
      const rawTemp = Math.max(0.3, speed2ToTemperature(particle.speed2()));
      const localThermalEstimate = clamp(lerp(rawTemp, bulkTemp, anchorToBulk), minDisplayTemp, maxDisplayTemp);
      particle.instantTemperature = rawTemp;
      particle.displayTemperature = particle.displayTemperature == null
        ? localThermalEstimate
        : lerp(particle.displayTemperature, localThermalEstimate, relaxAlpha);
    }
  }

  step(dt) {
    // Verlet is a good middle ground here: stable enough for the classroom demo without overcomplicating the loop.
    for (const particle of this.particles) {
      particle.prevX = particle.x;
      particle.prevY = particle.y;
      particle.x += particle.vx * dt + 0.5 * particle.ax * dt * dt;
      particle.y += particle.vy * dt + 0.5 * particle.ay * dt * dt;
      particle.vx += 0.5 * particle.ax * dt;
      particle.vy += 0.5 * particle.ay * dt;
      this.applyBoundaries(particle);
    }

    this.computeForces();

    for (const particle of this.particles) {
      particle.vx += 0.5 * particle.ax * dt;
      particle.vy += 0.5 * particle.ay * dt;
    }

    const stats = this.updateMetrics();
    this.thermo.coupleToBulk(this.particles, stats, dt);
    this.thermo.updateAtmosphericWater(this.bounds, this.visualBounds ?? this.bounds, dt);
    this.updateMetrics();
    this.stabilizeParticleSpeeds();
    this.syncSpeedsToBulkTemperature();
    this.updateParticleDisplayTemperatures(dt);
    return this.updateMetrics();
  }

  updateMetrics() {
    let kinetic = 0;
    let speed2Sum = 0;
    let neighborSum = 0;
    let maxRadius = 0;
    const centerX = (this.bounds.minX + this.bounds.maxX) * 0.5;
    const centerY = (this.bounds.minY + this.bounds.maxY) * 0.5;

    for (const particle of this.particles) {
      const speed2 = particle.speed2();
      kinetic += 0.5 * particle.mass * speed2;
      speed2Sum += speed2;
      neighborSum += particle.neighbors;
      maxRadius = Math.max(maxRadius, Math.hypot(particle.x - centerX, particle.y - centerY));
    }

    const avgSpeed2 = speed2Sum / Math.max(1, this.particles.length);
    const kineticTemperature = speed2ToTemperature(avgSpeed2);
    const temperature = this.thermo?.sampleTemperature ?? kineticTemperature;
    const avgNeighbors = neighborSum / Math.max(1, this.particles.length);
    const boxArea = (this.bounds.maxX - this.bounds.minX) * (this.bounds.maxY - this.bounds.minY);
    const particleArea = this.particles.length * Math.PI * Math.pow(this.config.sigma * 0.42, 2);
    const density = particleArea / boxArea;
    const avgSpeed = speedToNormalized(Math.sqrt(avgSpeed2));
    const displayTemp = absoluteToDisplay(temperature);
    const thermoPhase = this.thermo?.phaseState ?? null;

    // Keep the label tied to what the particles are actually doing, not just the slider value.
    let phase = "Gas-like";
    if (thermoPhase?.solid > 0.55) {
      phase = "Solid-like";
    } else if (thermoPhase?.gas > 0.55) {
      phase = "Gas-like";
    } else if (thermoPhase?.liquid > 0.35) {
      phase = "Liquid-like";
    } else if ((displayTemp < 5 && avgNeighbors > 4.8) || (avgNeighbors > 4.6 && avgSpeed < 1.2)) {
      phase = "Solid-like";
    } else if ((avgNeighbors > 5 && displayTemp < 140) || (avgNeighbors > 2.4 && avgSpeed < 3.15)) {
      phase = "Liquid-like";
    }

    this.metrics = {
      temperature,
      kinetic,
      potential: this.metrics.potential,
      total: kinetic + this.metrics.potential,
      phase,
      avgSpeed,
      density,
      spread: maxRadius,
      kineticTemperature,
      bulkTemperature: this.thermo?.sampleTemperature ?? kineticTemperature
    };
    return this.metrics;
  }

  findParticleAt(x, y, radius = 18) {
    let nearest = null;
    let best = radius * radius;
    for (const particle of this.particles) {
      const dx = particle.x - x;
      const dy = particle.y - y;
      const distance2 = dx * dx + dy * dy;
      if (distance2 < best) {
        best = distance2;
        nearest = particle;
      }
    }
    return nearest;
  }
}
