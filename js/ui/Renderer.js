import { MATERIALS } from "../config.js";
import {
  absoluteToDisplay,
  clamp,
  fmt,
  formatTemperature,
  getTemperatureSliderRange,
  lerp,
  speed2ToTemperature,
  temperatureUnitSymbol,
  toDisplayTemperature
} from "../utils.js";

export class Renderer {
  constructor(canvas, graphCanvases, overlayElement, tooltipElement, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.graphCanvases = graphCanvases;
    this.graphContexts = Object.fromEntries(
      Object.entries(graphCanvases).map(([key, graphCanvas]) => [key, graphCanvas.getContext("2d")])
    );
    this.overlayElement = overlayElement;
    this.tooltipElement = tooltipElement;
    this.config = config;
  }

  getTrackedSeriesPalette() {
    return ["#1f7ae0", "#de5b34", "#1d9d7e", "#8b58d8", "#c38a1d", "#c1467a", "#3477c2", "#5f9b2c"];
  }

  particleDisplayTemperature(particle) {
    return particle.displayTemperature ?? speed2ToTemperature(particle.speed2());
  }

  resize() {
    const simRect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(simRect.width * devicePixelRatio);
    this.canvas.height = Math.floor(simRect.height * devicePixelRatio);
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    this.resizeGraphCanvases();

    return {
      simWidth: simRect.width,
      simHeight: simRect.height
    };
  }

  resizeGraphCanvases() {
    Object.values(this.graphCanvases).forEach((graphCanvas) => {
      const graphRect = graphCanvas.getBoundingClientRect();
      graphCanvas.width = Math.floor(graphRect.width * devicePixelRatio);
      graphCanvas.height = Math.floor(graphRect.height * devicePixelRatio);
      const graphContext = graphCanvas.getContext("2d");
      graphContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    });
  }

  tempColor(temperature, bulkTemperature = temperature) {
    const displayTemp = absoluteToDisplay(temperature);
    const bulkDisplayTemp = absoluteToDisplay(bulkTemperature);
    const extremeFactor = clamp(Math.abs(bulkDisplayTemp - 22) / 95, 0, 1);
    const localInfluence = lerp(0.62, 0.28, extremeFactor);
    const deviationLimit = lerp(24, 8, extremeFactor);
    const shiftedLocalTemp = bulkDisplayTemp + clamp((displayTemp - bulkDisplayTemp) * localInfluence, -deviationLimit, deviationLimit);
    const effectiveDisplayTemp = shiftedLocalTemp;
    const normalized = clamp((effectiveDisplayTemp + 12) / 72, 0, 1);
    const palette = [
      { t: 0, rgb: [40, 92, 232] },
      { t: 0.22, rgb: [77, 163, 244] },
      { t: 0.45, rgb: [104, 204, 230] },
      { t: 0.62, rgb: [244, 184, 74] },
      { t: 0.8, rgb: [241, 103, 51] },
      { t: 1, rgb: [205, 42, 28] }
    ];

    let lower = palette[0];
    let upper = palette[palette.length - 1];
    for (let index = 1; index < palette.length; index += 1) {
      if (normalized <= palette[index].t) {
        lower = palette[index - 1];
        upper = palette[index];
        break;
      }
    }

    const span = Math.max(0.0001, upper.t - lower.t);
    const localT = clamp((normalized - lower.t) / span, 0, 1);
    const brightnessBias = clamp((displayTemp - bulkDisplayTemp) / 26, -0.16, 0.16);
    const r = Math.round(clamp(lerp(lower.rgb[0], upper.rgb[0], localT) + brightnessBias * 34, 0, 255));
    const g = Math.round(clamp(lerp(lower.rgb[1], upper.rgb[1], localT) + brightnessBias * 10, 0, 255));
    const b = Math.round(clamp(lerp(lower.rgb[2], upper.rgb[2], localT) - brightnessBias * 36, 0, 255));
    return `rgb(${r} ${g} ${b})`;
  }

  withAlpha(color, alpha) {
    const match = color.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/);
    if (!match) {
      return color;
    }
    const [, r, g, b] = match;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  drawSimulation(engine, thermo, history, hoveredParticle, trackedParticleIds = new Set()) {
    const context = this.ctx;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!this.config.trails) {
      context.clearRect(0, 0, width, height);
    } else {
      context.fillStyle = `rgba(7, 12, 17, ${0.08 + (1 - this.config.trailStrength) * 0.18})`;
      context.fillRect(0, 0, width, height);
    }

    this.drawSimulationBackdrop(width, height);
    this.drawContainer(engine.visualBounds ?? engine.bounds, engine.bounds, engine.metrics.temperature);
    this.drawZones(thermo.localZones);
    this.drawParticles(
      engine.particles,
      engine.metrics.temperature,
      hoveredParticle,
      trackedParticleIds,
      engine.config.sigma
    );
    if (this.config.cupPresent) {
      this.drawVapor(thermo);
      this.drawCupForeground(engine.visualBounds ?? engine.bounds, engine.bounds);
      this.drawSurfaceWater(engine.visualBounds ?? engine.bounds, engine.bounds, thermo);
    } else {
      this.drawVapor(thermo);
    }
    if (this.config.vectors) {
      this.drawVectors(engine.particles, hoveredParticle);
    }
    this.drawGraphPreview(history);
  }

  drawSimulationBackdrop(width, height) {
    const context = this.ctx;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#10212e");
    gradient.addColorStop(1, "#09131b");
    context.fillStyle = gradient;
    context.globalAlpha = this.config.trails ? 0.18 + this.config.trailStrength * 0.12 : 1;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;

    context.save();
    context.globalAlpha = 0.12;
    context.strokeStyle = "#cbeaf6";
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 34) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += 34) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();
  }

  drawContainer(bounds, innerBounds, temperature) {
    if (this.config.cupPresent) {
      this.drawCup(bounds, innerBounds, temperature);
    } else {
      this.drawTray(bounds, temperature);
    }
  }

  drawTray(bounds, temperature) {
    const context = this.ctx;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const fillTop = bounds.minY + height * 0.34;
    const fluidColor = this.tempColor(temperature, temperature);

    context.save();
    context.fillStyle = "rgba(245, 240, 231, 0.16)";
    context.beginPath();
    context.roundRect(bounds.minX, fillTop, width, height - (fillTop - bounds.minY), 26);
    context.fill();

    const plateGradient = context.createLinearGradient(bounds.minX, fillTop, bounds.maxX, bounds.maxY);
    plateGradient.addColorStop(0, "rgba(241, 237, 232, 0.20)");
    plateGradient.addColorStop(1, "rgba(184, 204, 217, 0.10)");
    context.fillStyle = plateGradient;
    context.beginPath();
    context.roundRect(bounds.minX, fillTop, width, height - (fillTop - bounds.minY), 26);
    context.fill();

    context.strokeStyle = "rgba(241, 236, 229, 0.54)";
    context.lineWidth = 2.2;
    context.beginPath();
    context.roundRect(bounds.minX, fillTop, width, height - (fillTop - bounds.minY), 26);
    context.stroke();

    context.strokeStyle = this.withAlpha(fluidColor, 0.36);
    context.beginPath();
    context.moveTo(bounds.minX + 18, fillTop);
    context.lineTo(bounds.maxX - 18, fillTop);
    context.stroke();
    context.restore();
  }

  drawCup(bounds, innerBounds, temperature) {
    const context = this.ctx;
    const material = MATERIALS[this.config.material];
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const innerWidth = innerBounds.maxX - innerBounds.minX;
    const innerHeight = innerBounds.maxY - innerBounds.minY;
    const fillHeight = innerHeight * 0.82;
    const fillTop = innerBounds.maxY - fillHeight;
    const fluidColor = this.tempColor(temperature, temperature);

    context.save();

    const glassFill = context.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    glassFill.addColorStop(0, "rgba(255,255,255,0.08)");
    glassFill.addColorStop(1, "rgba(255,255,255,0.02)");
    context.fillStyle = glassFill;
    context.beginPath();
    context.roundRect(bounds.minX, bounds.minY, width, height, 30);
    context.fill();

    const fluidGradient = context.createLinearGradient(bounds.minX, fillTop, bounds.maxX, bounds.maxY);
    fluidGradient.addColorStop(0, this.withAlpha(fluidColor, 0.08));
    fluidGradient.addColorStop(0.55, this.withAlpha(fluidColor, 0.12));
    fluidGradient.addColorStop(1, this.withAlpha(fluidColor, 0.22));
    context.fillStyle = fluidGradient;
    context.beginPath();
    context.roundRect(innerBounds.minX, fillTop, innerWidth, fillHeight, 20);
    context.fill();

    const wallGradient = context.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    wallGradient.addColorStop(0, "rgba(255,255,255,0.5)");
    wallGradient.addColorStop(0.5, material.color);
    wallGradient.addColorStop(1, "rgba(241, 239, 231, 0.25)");
    context.strokeStyle = wallGradient;
    context.lineWidth = 8 + this.config.cupThickness * 1.35;
    context.globalAlpha = 0.34;
    if (this.config.boundaryMode === "periodic") {
      context.setLineDash([10, 8]);
    }
    context.beginPath();
    context.roundRect(bounds.minX, bounds.minY, width, height, 30);
    context.stroke();
    context.setLineDash([]);

    context.globalAlpha = 0.92;
    context.lineWidth = 2;
    context.strokeStyle = "rgba(245, 246, 239, 0.55)";
    context.beginPath();
    context.roundRect(bounds.minX, bounds.minY, width, height, 30);
    context.stroke();

    context.strokeStyle = this.withAlpha(fluidColor, 0.30);
    context.beginPath();
    context.moveTo(innerBounds.minX + 14, fillTop);
    context.quadraticCurveTo((innerBounds.minX + innerBounds.maxX) / 2, fillTop - 5, innerBounds.maxX - 14, fillTop);
    context.stroke();

    context.restore();
  }

  drawCupForeground(bounds, innerBounds) {
    const context = this.ctx;
    const material = MATERIALS[this.config.material];
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const innerWidth = innerBounds.maxX - innerBounds.minX;
    const innerHeight = innerBounds.maxY - innerBounds.minY;

    context.save();
    context.lineWidth = 4;
    context.strokeStyle = material.color;
    context.globalAlpha = 0.94;
    context.beginPath();
    context.roundRect(bounds.minX - 2, bounds.minY - 2, width + 4, height + 4, 32);
    context.stroke();

    context.strokeStyle = "rgba(236, 246, 251, 0.58)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(innerBounds.minX, innerBounds.minY, innerWidth, innerHeight, 18);
    context.stroke();

    context.fillStyle = "rgba(247, 244, 236, 0.96)";
    context.strokeStyle = material.color;
    context.lineWidth = 1.6;
    context.beginPath();
    context.roundRect(bounds.minX + 18, bounds.minY + 14, 114, 30, 15);
    context.fill();
    context.stroke();
    context.fillStyle = "#173040";
    context.font = '700 12px "Bahnschrift", "Aptos", sans-serif';
    context.fillText(`${this.config.material} cup`, bounds.minX + 30, bounds.minY + 33);
    context.restore();
  }

  drawVapor(thermo) {
    if (!thermo || !thermo.vaporParticles?.length) {
      return;
    }

    const context = this.ctx;
    context.save();
    context.globalCompositeOperation = "screen";
    for (const vapor of thermo.vaporParticles) {
      const gradient = context.createRadialGradient(vapor.x, vapor.y, 0, vapor.x, vapor.y, vapor.radius);
      gradient.addColorStop(0, `rgba(235, 244, 250, ${vapor.alpha})`);
      gradient.addColorStop(1, "rgba(235, 244, 250, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(vapor.x, vapor.y, vapor.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  drawSurfaceWater(bounds, innerBounds, thermo) {
    if (!thermo) {
      return;
    }

    const context = this.ctx;
    const wallWaterMass = (thermo.wallFilmMassKg ?? 0) + (thermo.wallDroplets ?? []).reduce((sum, droplet) => sum + droplet.massKg, 0);
    const visibleWetness = clamp(wallWaterMass / 1.2e-6, 0, 1);
    const wallGlossAlpha = 0.08 + visibleWetness * 0.34;

    context.save();
    if (visibleWetness > 0.03 && (thermo.wallFilmMassKg ?? 0) > 1e-8) {
      const glaze = context.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.minY);
      glaze.addColorStop(0, `rgba(232, 242, 248, ${wallGlossAlpha * 0.82})`);
      glaze.addColorStop(0.5, `rgba(245, 251, 255, ${wallGlossAlpha})`);
      glaze.addColorStop(1, `rgba(232, 242, 248, ${wallGlossAlpha * 0.82})`);
      context.fillStyle = glaze;
      context.beginPath();
      context.roundRect(bounds.minX + 3, bounds.minY + 9, bounds.maxX - bounds.minX - 6, 22, 10);
      context.fill();

      context.strokeStyle = `rgba(246, 252, 255, ${0.16 + visibleWetness * 0.22})`;
      context.lineWidth = 1.15;
      context.beginPath();
      context.moveTo(bounds.minX + 11, bounds.minY + 18);
      context.lineTo(bounds.maxX - 11, bounds.minY + 18);
      context.stroke();
    }

    if ((thermo.wallDroplets?.length ?? 0) > 0) {
      context.strokeStyle = `rgba(219, 236, 246, ${0.10 + visibleWetness * 0.18})`;
      context.lineWidth = 1.2;
      for (const droplet of thermo.wallDroplets ?? []) {
        const radius = this.dropletRadius(droplet.massKg);
        context.beginPath();
        context.moveTo(droplet.x, droplet.y - radius * 1.1);
        context.lineTo(droplet.x, Math.max(bounds.minY + 12, droplet.y - radius * (1.8 + droplet.lengthNorm * 2.2)));
        context.stroke();
      }
    }

    for (const droplet of thermo.wallDroplets ?? []) {
      const radius = this.dropletRadius(droplet.massKg);
      const highlight = context.createRadialGradient(droplet.x - radius * 0.35, droplet.y - radius * 0.45, 0, droplet.x, droplet.y, radius * 1.1);
      highlight.addColorStop(0, "rgba(255, 255, 255, 0.84)");
      highlight.addColorStop(0.28, "rgba(227, 241, 249, 0.64)");
      highlight.addColorStop(1, "rgba(207, 229, 241, 0.22)");
      context.fillStyle = highlight;
      context.strokeStyle = "rgba(247, 252, 255, 0.78)";
      context.lineWidth = 1.05;
      context.beginPath();
      context.arc(droplet.x, droplet.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    for (const droplet of thermo.fallingDroplets ?? []) {
      const radius = this.dropletRadius(droplet.massKg) * 0.9;
      context.fillStyle = "rgba(219, 237, 247, 0.84)";
      context.strokeStyle = "rgba(249, 253, 255, 0.82)";
      context.lineWidth = 0.95;
      context.beginPath();
      context.ellipse(droplet.x, droplet.y, radius * 0.8, radius * 1.18, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    for (const splash of thermo.splashParticles ?? []) {
      context.fillStyle = `rgba(223, 239, 248, ${splash.alpha})`;
      context.beginPath();
      context.arc(splash.x, splash.y, splash.radius, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  dropletRadius(massKg) {
    return clamp(2.2 + Math.cbrt(Math.max(0, massKg) * 1.2e9) * 0.92, 2, 12.8);
  }

  drawZones(zones) {
    const context = this.ctx;
    for (const zone of zones) {
      const gradient = context.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.radius);
      if (zone.kind === "heat") {
        gradient.addColorStop(0, "rgba(225, 123, 62, 0.32)");
        gradient.addColorStop(1, "rgba(225, 123, 62, 0)");
      } else {
        gradient.addColorStop(0, "rgba(79, 162, 212, 0.30)");
        gradient.addColorStop(1, "rgba(79, 162, 212, 0)");
      }
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  drawParticles(particles, bulkTemp, hoveredParticle, trackedParticleIds, sigma) {
    const context = this.ctx;
    const radius = Math.max(4.2, sigma * 0.45);

    context.save();
    context.lineCap = "round";
    for (const particle of particles) {
      const particleTemp = this.particleDisplayTemperature(particle);
      const color = this.tempColor(particleTemp, bulkTemp);
      const dx = particle.x - particle.prevX;
      const dy = particle.y - particle.prevY;
      const streakLength = Math.hypot(dx, dy);
      const isTracked = trackedParticleIds.has(particle.id);

      if (streakLength > 0.1) {
        const alpha = isTracked ? 0.7 : 0.12 + this.config.trailStrength * 0.45;
        context.strokeStyle = this.withAlpha(color, alpha);
        context.lineWidth = radius * (isTracked ? 1.3 : 0.48 + this.config.trailStrength * 0.54);
        context.beginPath();
        context.moveTo(particle.prevX, particle.prevY);
        context.lineTo(particle.x, particle.y);
        context.stroke();
      }

      context.fillStyle = color;
      context.strokeStyle = isTracked ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.24)";
      context.lineWidth = isTracked ? 1.5 : 0.7;
      context.beginPath();
      context.arc(particle.x, particle.y, isTracked ? radius + 0.5 : radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      if (isTracked) {
        context.fillStyle = "rgba(245, 244, 239, 0.96)";
        context.font = '700 11px "Bahnschrift", "Aptos", sans-serif';
        context.fillText(`${particle.id}`, particle.x + 8, particle.y - 8);
      }
    }
    context.restore();

    if (hoveredParticle) {
      context.strokeStyle = "#fff9ef";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(hoveredParticle.x, hoveredParticle.y, radius + 5, 0, Math.PI * 2);
      context.stroke();
    }

    context.save();
    context.fillStyle = "rgba(242, 240, 235, 0.82)";
    context.font = '600 12px "Bahnschrift", "Aptos", sans-serif';
    context.fillText(`Sample temperature ${formatTemperature(bulkTemp, this.config.temperatureUnit, 1)}`, 18, 28);
    if (trackedParticleIds.size) {
      context.fillText(`Tracking ${trackedParticleIds.size} particle${trackedParticleIds.size > 1 ? "s" : ""}`, 18, 46);
    }
    context.restore();
  }

  drawVectors(particles, hoveredParticle) {
    const context = this.ctx;
    context.save();
    context.strokeStyle = "rgba(243, 241, 235, 0.18)";
    context.lineWidth = 1;
    for (let index = 0; index < particles.length; index += 3) {
      const particle = particles[index];
      const scale = 0.22;
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.lineTo(particle.x + particle.vx * scale, particle.y + particle.vy * scale);
      context.stroke();
    }

    if (hoveredParticle) {
      context.strokeStyle = "rgba(87, 183, 209, 0.96)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(hoveredParticle.x, hoveredParticle.y);
      context.lineTo(hoveredParticle.x + hoveredParticle.vx * 0.28, hoveredParticle.y + hoveredParticle.vy * 0.28);
      context.stroke();
    }
    context.restore();
  }

  drawGraphPreview(history) {
    const context = this.ctx;
    const { width } = this.canvas.getBoundingClientRect();
    const preview = history.samples.slice(-110);
    if (preview.length < 2) return;

    context.save();
    context.globalAlpha = 0.52;
    context.strokeStyle = "rgba(104, 194, 218, 0.4)";
    context.lineWidth = 1;
    context.beginPath();
    const range = getTemperatureSliderRange(this.config.temperatureUnit);
    preview.forEach((sample, index) => {
      const x = width - 150 + index / (preview.length - 1) * 128;
      const graphTemp = toDisplayTemperature(sample.temp, this.config.temperatureUnit);
      const y = 36 + (1 - clamp((graphTemp - range.min) / Math.max(1, range.max - range.min), 0, 1)) * 32;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  }
  getGraphPlotRegion(canvas) {
    const { width, height } = canvas.getBoundingClientRect();
    return {
      width,
      height,
      plot: {
        x: 52,
        y: 22,
        w: Math.max(80, width - 70),
        h: Math.max(90, height - 42)
      }
    };
  }

  prepareGraphCanvas(graphKey) {
    const graphCanvas = this.graphCanvases[graphKey];
    const context = this.graphContexts[graphKey];
    const { width, height, plot } = this.getGraphPlotRegion(graphCanvas);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f3efe4";
    context.fillRect(0, 0, width, height);
    return { context, width, height, plot };
  }

  drawTemperatureGraph(history) {
    const { plot } = this.prepareGraphCanvas("temperature");
    this.drawAxes("temperature", plot, "Temperature vs Time", temperatureUnitSymbol(this.config.temperatureUnit));

    const samples = history.samples;
    if (samples.length < 2) return;

    const tMin = samples[0].t;
    const tMax = samples[samples.length - 1].t;
    const tempValues = samples.map((sample) => toDisplayTemperature(sample.temp, this.config.temperatureUnit));
    const tempMin = Math.min(...tempValues, toDisplayTemperature(273.15, this.config.temperatureUnit));
    const tempMax = Math.max(...tempValues, toDisplayTemperature(373.15, this.config.temperatureUnit));

    this.drawLine(
      "temperature",
      samples,
      plot,
      tMin,
      tMax,
      tempMin,
      tempMax,
      (sample) => toDisplayTemperature(sample.temp, this.config.temperatureUnit),
      "#117a83",
      2.6
    );
  }

  drawEnergyGraph(history) {
    const { plot } = this.prepareGraphCanvas("energy");
    this.drawAxes("energy", plot, "Energy vs Time", "sim units");

    const samples = history.samples;
    if (samples.length < 2) return;

    const tMin = samples[0].t;
    const tMax = samples[samples.length - 1].t;
    const energyValues = samples.flatMap((sample) => [sample.ke, sample.pe, sample.total]);
    const energyMin = Math.min(...energyValues, -200);
    const energyMax = Math.max(...energyValues, 200);

    this.drawLine("energy", samples, plot, tMin, tMax, energyMin, energyMax, (sample) => sample.ke, "#e68633", 1.9);
    this.drawLine("energy", samples, plot, tMin, tMax, energyMin, energyMax, (sample) => sample.pe, "#7f5f3a", 1.9);
    this.drawLine("energy", samples, plot, tMin, tMax, energyMin, energyMax, (sample) => sample.total, "#2c4946", 2.3);
  }

  drawTrackedParticleGraph(particleHistory) {
    const { plot } = this.prepareGraphCanvas("tracked");
    const seriesEntries = [...particleHistory.entries()].filter(([, samples]) => samples.length > 1);

    this.drawAxes("tracked", plot, "Tracked Particle Temperature", temperatureUnitSymbol(this.config.temperatureUnit));
    if (!seriesEntries.length) {
      return;
    }

    const allSamples = seriesEntries.flatMap(([, samples]) => samples);
    const tMin = Math.min(...allSamples.map((sample) => sample.t));
    const tMax = Math.max(...allSamples.map((sample) => sample.t));
    const tempRange = getTemperatureSliderRange(this.config.temperatureUnit);
    const displayTemps = allSamples.map((sample) => toDisplayTemperature(sample.temp, this.config.temperatureUnit));
    const yMin = Math.min(...displayTemps, tempRange.min);
    const yMax = Math.max(...displayTemps, tempRange.max);
    const trackedPalette = this.getTrackedSeriesPalette();

    seriesEntries.forEach(([id, samples], index) => {
      const color = trackedPalette[index % trackedPalette.length];
      this.drawLine(
        "tracked",
        samples,
        plot,
        tMin,
        tMax,
        yMin,
        yMax,
        (sample) => toDisplayTemperature(sample.temp, this.config.temperatureUnit),
        color,
        1.8
      );
    });
  }

  drawAxes(graphKey, region, title, units) {
    const context = this.graphContexts[graphKey];
    context.save();
    context.strokeStyle = "rgba(24, 34, 48, 0.12)";
    context.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
      const y = region.y + (region.h / 4) * index;
      context.beginPath();
      context.moveTo(region.x, y);
      context.lineTo(region.x + region.w, y);
      context.stroke();
    }
    for (let index = 0; index <= 6; index += 1) {
      const x = region.x + (region.w / 6) * index;
      context.beginPath();
      context.moveTo(x, region.y);
      context.lineTo(x, region.y + region.h);
      context.stroke();
    }
    context.fillStyle = "#172330";
    context.font = '700 13px "Bahnschrift", "Aptos", sans-serif';
    context.fillText(title, region.x, region.y - 8);
    context.fillStyle = "#60707c";
    context.font = '500 11px "Aptos", "Segoe UI", sans-serif';
    context.fillText(units, region.x + region.w - 34, region.y - 8);
    context.restore();
  }

  drawLine(graphKey, samples, region, xMin, xMax, yMin, yMax, accessor, color, lineWidth) {
    const context = this.graphContexts[graphKey];
    const xSpan = Math.max(0.0001, xMax - xMin);
    const ySpan = Math.max(0.0001, yMax - yMin);
    context.save();
    context.beginPath();
    context.rect(region.x, region.y, region.w, region.h);
    context.clip();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = region.x + ((sample.t - xMin) / xSpan) * region.w;
      const y = region.y + region.h - ((accessor(sample) - yMin) / ySpan) * region.h;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  }

  updateTooltip(particle, pointer) {
    if (!particle || !pointer.inside) {
      this.tooltipElement.style.display = "none";
      return;
    }
    const particleTemp = this.particleDisplayTemperature(particle);
    this.tooltipElement.style.display = "block";
    this.tooltipElement.style.left = `${pointer.x}px`;
    this.tooltipElement.style.top = `${pointer.y}px`;
    this.tooltipElement.innerHTML = `
      <strong>Particle ${particle.id}</strong>
      <div class="line">Speed: ${fmt(Math.sqrt(particle.speed2()), 2)}</div>
      <div class="line">Local temperature: ${formatTemperature(particleTemp, this.config.temperatureUnit, 1)}</div>
      <div class="line">Kinetic energy: ${fmt(particle.kineticEnergy(), 2)} sim</div>
      <div class="line">Neighbors in shell: ${particle.neighbors}</div>
    `;
  }

  updateOverlay(config, stats) {
    if (!config.overlay) {
      this.overlayElement.innerHTML = "";
      return;
    }

    const heatDirection = stats.temperature > config.ambientTemp ? "leaving the sample" : "entering the sample";
    const material = config.cupPresent ? MATERIALS[config.material].k : "no cup wall";
    this.overlayElement.innerHTML = `
      <div class="overlay-card overlay-card-single">
        <h4>Live Concept Note</h4>
        <p>
          The sample is currently <strong>${stats.phase.toLowerCase()}</strong>. Thermal energy is ${heatDirection},
          and the current boundary condition is <strong>${config.boundaryMode}</strong>.
          ${config.cupPresent ? `Cup conductivity: <strong>${material}</strong>.` : "Students can place a cup from the Scenario tab."}
        </p>
      </div>
    `;
  }
}
