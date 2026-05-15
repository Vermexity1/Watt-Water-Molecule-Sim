import { DEFAULTS, SIMULATION_RATE } from "./config.js";
import { GraphBuffer } from "./core/GraphBuffer.js";
import { PhysicsEngine } from "./core/PhysicsEngine.js";
import { ThermodynamicsEngine } from "./core/ThermodynamicsEngine.js";
import { Renderer } from "./ui/Renderer.js";
import { UIController } from "./ui/UIController.js";
import { clamp, speed2ToTemperature } from "./utils.js";

class SimulationApp {
  constructor() {
    this.config = { ...DEFAULTS };
    this.simCanvas = document.getElementById("simCanvas");
    this.graphCanvases = {
      temperature: document.getElementById("tempGraphCanvas"),
      tracked: document.getElementById("trackedGraphCanvas"),
      energy: document.getElementById("energyGraphCanvas")
    };
    this.welcomeCanvas = document.getElementById("welcomeCanvas");
    this.welcomeScreen = document.getElementById("welcomeScreen");
    this.enterLabBtn = document.getElementById("enterLabBtn");
    this.overlayElement = document.getElementById("overlayNotes");
    this.tooltipElement = document.getElementById("tooltip");
    this.appShell = document.querySelector(".app");
    this.panelSplitter = document.getElementById("panelSplitter");
    this.graphSectionSplitter = document.getElementById("graphSectionSplitter");

    this.thermo = new ThermodynamicsEngine(this.config);
    this.engine = new PhysicsEngine(this.config, this.thermo);
    this.renderer = new Renderer(this.simCanvas, this.graphCanvases, this.overlayElement, this.tooltipElement, this.config);
    this.history = new GraphBuffer();
    this.ui = new UIController(this);

    this.running = false;
    this.trials = [];
    this.trackedParticleIds = new Set();
    this.trackedParticleInput = "";
    this.particleHistory = new Map();
    this.hoveredParticle = null;
    this.pointer = {
      x: 0,
      y: 0,
      inside: false,
      down: false,
      dragStartX: 0,
      dragStartY: 0,
      moved: false
    };
    this.lastFrame = performance.now();
    this.fps = 0;
    this.simTime = 0;
    this.labEntered = false;
    this.welcomeBurstParticles = [];
    this.welcomeTime = 0;
    this.welcomeSequenceFinished = false;
    this.welcomeContext = this.welcomeCanvas?.getContext("2d") ?? null;
    this.welcomeTitleBlock = document.getElementById("welcomeTitleBlock");
    this.graphLayout = {
      visibility: {
        temperature: true,
        tracked: true,
        energy: true
      },
      sizes: {
        temperature: 38,
        tracked: 34,
        energy: 28
      },
      dragging: null
    };
    this.sectionLayout = {
      panelWidth: 390,
      graphHeight: 230,
      dragging: null
    };

    this.setupCanvas();
    this.setupGraphLayout();
    this.setupSectionLayout();
    this.bindCanvasInteractions();
    this.setupWelcomeScreen();
    this.resetSimulation(true);
    requestAnimationFrame((time) => this.frame(time));
  }

  setupCanvas() {
    const { simWidth, simHeight } = this.renderer.resize();
    this.engine.config = this.config;
    this.engine.resize(simWidth, simHeight);
  }

  resizeAndRebuild() {
    this.setupCanvas();
    this.applyGraphPaneLayout();
    this.resizeWelcomeCanvas();
    this.resetSimulation(false);
  }

  refreshLayoutCanvases() {
    const { simWidth, simHeight } = this.renderer.resize();
    this.engine.resize(simWidth, simHeight);
    this.engine.fitParticlesToBounds();
  }

  setupSectionLayout() {
    this.panelSplitter?.addEventListener("pointerdown", (event) => this.beginSectionResize(event, "panel"));
    this.graphSectionSplitter?.addEventListener("pointerdown", (event) => this.beginSectionResize(event, "graph"));
    window.addEventListener("pointermove", (event) => this.updateSectionResize(event));
    window.addEventListener("pointerup", () => this.endSectionResize());
    this.applySectionLayout();
  }

  applySectionLayout() {
    if (!this.appShell) {
      return;
    }
    this.appShell.style.setProperty("--panel-width", `${this.sectionLayout.panelWidth}px`);
    this.appShell.style.setProperty("--graph-height", `${this.sectionLayout.graphHeight}px`);
    this.refreshLayoutCanvases();
  }

  beginSectionResize(event, kind) {
    if (!this.appShell) {
      return;
    }

    const appRect = this.appShell.getBoundingClientRect();
    this.sectionLayout.dragging = {
      kind,
      appRect
    };

    if (kind === "panel") {
      this.panelSplitter?.classList.add("dragging");
    } else {
      this.graphSectionSplitter?.classList.add("dragging");
    }
  }

  updateSectionResize(event) {
    const drag = this.sectionLayout.dragging;
    if (!drag) {
      return;
    }

    if (drag.kind === "panel") {
      const nextWidth = clamp(drag.appRect.right - event.clientX - 16, 300, 560);
      this.sectionLayout.panelWidth = nextWidth;
    } else {
      const nextHeight = clamp(drag.appRect.bottom - event.clientY - 16, 180, 360);
      this.sectionLayout.graphHeight = nextHeight;
    }

    this.applySectionLayout();
  }

  endSectionResize() {
    if (!this.sectionLayout.dragging) {
      return;
    }
    this.panelSplitter?.classList.remove("dragging");
    this.graphSectionSplitter?.classList.remove("dragging");
    this.sectionLayout.dragging = null;
  }

  setupGraphLayout() {
    this.graphScroll = document.getElementById("graphScroll");
    this.graphPanes = {
      temperature: document.getElementById("tempGraphPane"),
      tracked: document.getElementById("trackedGraphPane"),
      energy: document.getElementById("energyGraphPane")
    };
    this.graphToggleButtons = {
      temperature: document.getElementById("toggleTempGraphBtn"),
      tracked: document.getElementById("toggleTrackedGraphBtn"),
      energy: document.getElementById("toggleEnergyGraphBtn")
    };
    this.graphSplitters = [
      document.getElementById("splitterTempTracked"),
      document.getElementById("splitterTrackedEnergy")
    ];

    Object.entries(this.graphToggleButtons).forEach(([pane, button]) => {
      button?.addEventListener("click", () => this.toggleGraphPane(pane));
    });

    this.graphSplitters.forEach((splitter) => {
      splitter?.addEventListener("pointerdown", (event) => this.beginGraphResize(event, splitter));
    });

    window.addEventListener("pointermove", (event) => this.updateGraphResize(event));
    window.addEventListener("pointerup", () => this.endGraphResize());
    this.applyGraphPaneLayout();
  }

  getVisibleGraphPanes() {
    return Object.entries(this.graphLayout.visibility)
      .filter(([, visible]) => visible)
      .map(([pane]) => pane);
  }

  normalizeGraphPaneSizes() {
    const visiblePanes = this.getVisibleGraphPanes();
    if (!visiblePanes.length) {
      return;
    }
    const total = visiblePanes.reduce((sum, pane) => sum + this.graphLayout.sizes[pane], 0);
    if (total <= 0) {
      const equalSize = 100 / visiblePanes.length;
      visiblePanes.forEach((pane) => {
        this.graphLayout.sizes[pane] = equalSize;
      });
      return;
    }
    visiblePanes.forEach((pane) => {
      this.graphLayout.sizes[pane] = this.graphLayout.sizes[pane] / total * 100;
    });
  }

  toggleGraphPane(pane) {
    const visiblePanes = this.getVisibleGraphPanes();
    const isVisible = this.graphLayout.visibility[pane];

    if (isVisible && visiblePanes.length === 1) {
      return;
    }

    this.graphLayout.visibility[pane] = !isVisible;
    if (this.graphLayout.visibility[pane]) {
      this.graphLayout.sizes[pane] = 30;
    }
    this.normalizeGraphPaneSizes();
    this.applyGraphPaneLayout();
  }

  applyGraphPaneLayout() {
    Object.entries(this.graphPanes).forEach(([pane, element]) => {
      const isVisible = this.graphLayout.visibility[pane];
      element?.classList.toggle("hidden", !isVisible);
      if (element) {
        element.style.setProperty("--pane-size", `${this.graphLayout.sizes[pane]}`);
      }
      this.graphToggleButtons[pane]?.classList.toggle("active", isVisible);
    });

    this.graphSplitters.forEach((splitter) => {
      if (!splitter) return;
      const first = splitter.dataset.first;
      const second = splitter.dataset.second;
      const shouldShow = this.graphLayout.visibility[first] && this.graphLayout.visibility[second];
      splitter.classList.toggle("hidden", !shouldShow);
    });

    this.renderer.resizeGraphCanvases();
  }

  beginGraphResize(event, splitter) {
    const first = splitter.dataset.first;
    const second = splitter.dataset.second;
    if (!this.graphLayout.visibility[first] || !this.graphLayout.visibility[second]) {
      return;
    }

    this.graphLayout.dragging = {
      splitter,
      first,
      second,
      startY: event.clientY,
      startFirst: this.graphLayout.sizes[first],
      startSecond: this.graphLayout.sizes[second],
      containerHeight: Math.max(1, this.graphScroll?.clientHeight ?? 1)
    };
    splitter.classList.add("dragging");
  }

  updateGraphResize(event) {
    const drag = this.graphLayout.dragging;
    if (!drag) {
      return;
    }

    const minSize = 18;
    const deltaPercent = ((event.clientY - drag.startY) / drag.containerHeight) * 100;
    const total = drag.startFirst + drag.startSecond;
    const nextFirst = clamp(drag.startFirst + deltaPercent, minSize, total - minSize);
    const nextSecond = total - nextFirst;

    this.graphLayout.sizes[drag.first] = nextFirst;
    this.graphLayout.sizes[drag.second] = nextSecond;
    this.applyGraphPaneLayout();
  }

  endGraphResize() {
    const drag = this.graphLayout.dragging;
    if (!drag) {
      return;
    }
    drag.splitter?.classList.remove("dragging");
    this.graphLayout.dragging = null;
  }

  bindCanvasInteractions() {
    const getPointer = (event) => {
      const rect = this.simCanvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };

    this.simCanvas.addEventListener("pointerdown", (event) => {
      const position = getPointer(event);
      this.pointer.down = true;
      this.pointer.moved = false;
      this.pointer.dragStartX = position.x;
      this.pointer.dragStartY = position.y;
      this.pointer.x = position.x;
      this.pointer.y = position.y;
    });

    this.simCanvas.addEventListener("pointermove", (event) => {
      const position = getPointer(event);
      this.pointer.x = position.x;
      this.pointer.y = position.y;
      this.pointer.inside = true;
      this.hoveredParticle = this.engine.findParticleAt(position.x, position.y);

      if (!this.pointer.down) return;
      const dx = position.x - this.pointer.dragStartX;
      const dy = position.y - this.pointer.dragStartY;
      const distance = Math.hypot(dx, dy);
      if (distance <= 7) return;

      this.pointer.moved = true;
      this.thermo.setDragField({
        x: position.x,
        y: position.y,
        fx: clamp(dx / 18, -3.5, 3.5),
        fy: clamp(dy / 18, -3.5, 3.5),
        radius: 90
      });
    });

    const releasePointer = () => {
      if (this.pointer.down && !this.pointer.moved) {
        this.thermo.addZone(this.pointer.x, this.pointer.y, this.config.brushTemperature);
      }
      this.pointer.down = false;
      this.pointer.moved = false;
      this.thermo.clearDragField();
    };

    this.simCanvas.addEventListener("pointerup", releasePointer);
    this.simCanvas.addEventListener("pointerleave", () => {
      this.pointer.inside = false;
      this.pointer.down = false;
      this.pointer.moved = false;
      this.hoveredParticle = null;
      this.thermo.clearDragField();
    });

    window.addEventListener("resize", () => this.resizeAndRebuild());
  }

  setupWelcomeScreen() {
    if (!this.welcomeCanvas || !this.welcomeScreen || !this.enterLabBtn) {
      this.labEntered = true;
      return;
    }

    this.resizeWelcomeCanvas();
    this.createWelcomeParticles();
    this.enterLabBtn.addEventListener("click", () => {
      this.labEntered = true;
      this.welcomeScreen.classList.add("hidden");
      this.running = true;
    });
  }

  resizeWelcomeCanvas() {
    if (!this.welcomeCanvas || !this.welcomeContext) {
      return;
    }
    const rect = this.welcomeCanvas.getBoundingClientRect();
    this.welcomeCanvas.width = Math.floor(rect.width * devicePixelRatio);
    this.welcomeCanvas.height = Math.floor(rect.height * devicePixelRatio);
    this.welcomeContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  createWelcomeParticles() {
    if (!this.welcomeCanvas) {
      return;
    }
    const rect = this.welcomeCanvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || 640);
    const height = Math.max(240, rect.height || 420);
    this.welcomeBurstParticles = Array.from({ length: 110 }, (_, id) => ({
      id,
      angle: Math.random() * Math.PI * 2,
      speed: 1.4 + Math.random() * 4.6,
      radius: 2.6 + Math.random() * 3.2,
      offset: Math.random() * 18,
      wobble: 0.4 + Math.random() * 0.8,
      hot: Math.random() > 0.5,
      alpha: 0.35 + Math.random() * 0.65
    }));
  }

  drawWelcomeScreen(deltaMs) {
    if (!this.welcomeCanvas || !this.welcomeContext || this.labEntered) {
      return;
    }

    const ctx = this.welcomeContext;
    const rect = this.welcomeCanvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    this.welcomeTime += deltaMs / 1000;
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#010204");
    gradient.addColorStop(0.45, "#04080d");
    gradient.addColorStop(1, "#020407");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const introBlank = 0.45;
    const riseStart = 0.45;
    const riseDuration = 1.7;
    const holdDuration = 0.65;
    const burstStart = riseStart + riseDuration + holdDuration;
    const burstDuration = 3.4;
    const centerX = width * 0.5;
    const centerY = height * 0.44;
    const startY = height + 100;
    const riseT = clamp((this.welcomeTime - riseStart) / riseDuration, 0, 1);
    const easedRise = 1 - Math.pow(1 - riseT, 3);
    const moleculeY = startY + (centerY - startY) * easedRise;
    const preBurstVisible = this.welcomeTime >= introBlank && this.welcomeTime < burstStart + 0.08;
    const burstT = clamp((this.welcomeTime - burstStart) / burstDuration, 0, 1);

    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.42);
    glow.addColorStop(0, "rgba(82, 186, 208, 0.12)");
    glow.addColorStop(0.4, "rgba(82, 186, 208, 0.04)");
    glow.addColorStop(1, "rgba(82, 186, 208, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    if (preBurstVisible) {
      this.drawWaterMolecule(ctx, centerX, moleculeY, 1, burstT > 0 ? 1 - burstT : 1, this.welcomeTime);
    }

    if (this.welcomeTime >= burstStart - 0.04) {
      this.drawBurstField(ctx, centerX, centerY, burstT, width, height);
    }

    if (!this.welcomeSequenceFinished && this.welcomeTime > burstStart + 0.6) {
      this.welcomeSequenceFinished = true;
      this.welcomeTitleBlock?.classList.add("visible");
    }
  }

  drawWaterMolecule(ctx, x, y, scale, alpha, time) {
    const pulse = 1 + Math.sin(time * 5.4) * 0.03;
    const oxygenR = 34 * scale * pulse;
    const hydrogenR = 17 * scale * pulse;
    const arm = 44 * scale;
    const armLift = 24 * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(201, 239, 255, 0.42)";
    ctx.lineWidth = 6 * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - arm, y - armLift);
    ctx.moveTo(x, y);
    ctx.lineTo(x + arm, y - armLift);
    ctx.stroke();

    const oxygenGlow = ctx.createRadialGradient(x, y, 0, x, y, oxygenR * 2.2);
    oxygenGlow.addColorStop(0, "rgba(83, 180, 227, 0.55)");
    oxygenGlow.addColorStop(1, "rgba(83, 180, 227, 0)");
    ctx.fillStyle = oxygenGlow;
    ctx.beginPath();
    ctx.arc(x, y, oxygenR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(96, 188, 234, 0.96)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, oxygenR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(226, 244, 255, 0.96)";
    ctx.beginPath();
    ctx.arc(x - arm, y - armLift, hydrogenR, 0, Math.PI * 2);
    ctx.arc(x + arm, y - armLift, hydrogenR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBurstField(ctx, centerX, centerY, burstT, width, height) {
    const eased = 1 - Math.pow(1 - burstT, 2.2);
    const fade = clamp(1 - Math.max(0, burstT - 0.78) / 0.22, 0, 1);

    ctx.save();
    for (const particle of this.welcomeBurstParticles) {
      const travel = particle.offset + eased * (100 + particle.speed * 110);
      const wobbleX = Math.cos(this.welcomeTime * (1.4 + particle.wobble) + particle.id) * 6;
      const wobbleY = Math.sin(this.welcomeTime * (1.7 + particle.wobble) + particle.id * 0.4) * 6;
      const x = centerX + Math.cos(particle.angle) * travel + wobbleX;
      const y = centerY + Math.sin(particle.angle) * travel + wobbleY;
      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;

      const color = particle.hot
        ? `rgba(236, 118, 70, ${particle.alpha * fade})`
        : `rgba(88, 173, 232, ${particle.alpha * fade})`;
      ctx.fillStyle = color;
      ctx.strokeStyle = `rgba(255,255,255,${0.10 * fade})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, particle.radius * (0.9 + fade * 0.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const flash = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 200 + eased * 200);
    flash.addColorStop(0, `rgba(230, 248, 255, ${0.26 * fade})`);
    flash.addColorStop(0.25, `rgba(126, 208, 227, ${0.14 * fade})`);
    flash.addColorStop(1, "rgba(126, 208, 227, 0)");
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  resetSimulation(clearTrials = false, options = {}) {
    if (clearTrials) {
      this.trials = [];
    }
    this.simTime = 0;
    this.hoveredParticle = null;
    this.history.clear();
    this.particleHistory.clear();
    this.thermo.reset(this.config, options);
    this.thermo.setTemperatureTarget(this.config.temperature);
    this.engine.config = this.config;
    this.engine.resize(this.simCanvas.getBoundingClientRect().width, this.simCanvas.getBoundingClientRect().height);
    this.engine.reset(this.config);
    this.thermo.primeVisualState(this.engine.bounds, this.engine.visualBounds ?? this.engine.bounds, this.engine.particles.length);
    this.pushHistory();
    this.pushTrackedParticleHistory();
    this.ui.renderTrialTable(this.trials);
  }

  rebuildScenario(options = {}) {
    const { start = this.running, activateRunTab = false } = options;
    this.resetSimulation(false);
    this.running = Boolean(start);
    if (activateRunTab) {
      this.ui.activateTab("controls");
    }
  }

  applyScenario(options = {}) {
    this.rebuildScenario({
      start: Boolean(options.start),
      activateRunTab: true
    });
  }

  previewScenario() {
    this.rebuildScenario({
      start: this.running,
      activateRunTab: false
    });
  }

  stopScenario() {
    this.running = false;
  }

  resetToIceState() {
    this.resetSimulation(false, { startMode: "ice" });
  }

  recordTrial() {
    const stats = this.engine.metrics;
    this.trials.push({
      material: this.config.material,
      deltaT: stats.temperature - this.thermo.initialTemp,
      heatLoss: this.thermo.heatLost,
      coolingRate: this.thermo.lastCoolingRate,
      score: this.thermo.insulationScore
    });
    this.ui.renderTrialTable(this.trials);
  }

  toggleRunning() {
    this.running = !this.running;
  }

  setSystemTemperature(temp, options = {}) {
    const { immediate = false } = options;
    this.config.temperature = temp;
    this.thermo.setTemperatureTarget(temp);
    if (immediate) {
      const current = this.engine.metrics.temperature;
      const next = current + (temp - current) * (this.running ? 0.48 : 1);
      this.engine.setTemperature(next);
    }
  }

  refreshStartingTemperature() {
    // When the inside temperature is acting as a setup value rather than a live thermostat,
    // changing it during setup should rebuild the sample so the molecules actually start there.
    if (this.config.thermostat || this.running) {
      return;
    }
    this.previewScenario();
  }

  parseTrackedParticleIds(rawInput) {
    const clauses = rawInput
      .split(/[;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const selected = new Set();

    for (const clause of clauses) {
      const exclusionMatch = clause.match(/^(\d+)\s*-\s*(\d+)\s*n\s*([\d\s,]+)$/i);
      if (exclusionMatch) {
        const [, startRaw, endRaw, excludedRaw] = exclusionMatch;
        const rangeValues = this.expandParticleRange(Number(startRaw), Number(endRaw));
        const excluded = new Set(
          excludedRaw
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value >= 0)
        );
        rangeValues.forEach((value) => {
          if (!excluded.has(value)) {
            selected.add(value);
          }
        });
        continue;
      }

      const parts = clause.includes(",") ? clause.split(",") : [clause];
      for (const part of parts) {
        const token = part.trim();
        if (!token) continue;

        const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
          const [, startRaw, endRaw] = rangeMatch;
          this.expandParticleRange(Number(startRaw), Number(endRaw)).forEach((value) => selected.add(value));
          continue;
        }

        const id = Number(token);
        if (Number.isInteger(id) && id >= 0) {
          selected.add(id);
        }
      }
    }

    return [...selected].sort((a, b) => a - b);
  }

  expandParticleRange(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0) {
      return [];
    }

    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const values = [];
    for (let id = low; id <= high; id += 1) {
      values.push(id);
    }
    return values;
  }

  findParticleById(id) {
    return this.engine.particles.find((particle) => particle.id === id) ?? null;
  }

  setTrackedParticlesFromInput(rawInput) {
    this.trackedParticleInput = rawInput;
    const ids = this.parseTrackedParticleIds(rawInput);
    this.trackedParticleIds = new Set(ids);
    this.particleHistory.clear();
    this.ensureTrackedParticleHistory();
    this.pushTrackedParticleHistory();
  }

  clearTrackedParticles() {
    this.trackedParticleIds = new Set();
    this.trackedParticleInput = "";
    this.particleHistory.clear();
  }

  getTrackedParticles() {
    if (!this.trackedParticleIds.size) {
      return [];
    }

    return [...this.trackedParticleIds]
      .map((id) => this.findParticleById(id))
      .filter(Boolean)
      .map((particle) => ({
        id: particle.id,
        temperature: particle.displayTemperature ?? speed2ToTemperature(particle.speed2()),
        instantTemperature: particle.instantTemperature ?? speed2ToTemperature(particle.speed2()),
        speed: Math.sqrt(particle.speed2()),
        neighbors: particle.neighbors
      }));
  }

  ensureTrackedParticleHistory() {
    const activeIds = new Set(this.trackedParticleIds);
    for (const id of [...this.particleHistory.keys()]) {
      if (!activeIds.has(id)) {
        this.particleHistory.delete(id);
      }
    }
    for (const id of activeIds) {
      if (!this.particleHistory.has(id)) {
        this.particleHistory.set(id, []);
      }
    }
  }

  pushHistory() {
    const stats = this.engine.metrics;
    this.history.push({
      t: this.simTime,
      temp: stats.temperature,
      ambient: this.config.ambientTemp,
      source: this.config.temperature,
      ke: stats.kinetic,
      pe: stats.potential,
      total: stats.total,
      heatFlow: this.thermo.lastHeatFlow
    });
  }

  pushTrackedParticleHistory() {
    if (!this.trackedParticleIds.size) {
      return;
    }

    this.ensureTrackedParticleHistory();
    for (const id of this.trackedParticleIds) {
      const particle = this.findParticleById(id);
      if (!particle) continue;
      const series = this.particleHistory.get(id) ?? [];
      series.push({
        t: this.simTime,
        temp: particle.displayTemperature ?? speed2ToTemperature(particle.speed2()),
        speed: Math.sqrt(particle.speed2())
      });
      if (series.length > this.history.limit) {
        series.shift();
      }
      this.particleHistory.set(id, series);
    }
  }

  frame(timestamp) {
    const deltaMs = Math.min(50, timestamp - this.lastFrame);
    this.lastFrame = timestamp;
    this.fps = this.fps * 0.92 + (1000 / Math.max(1, deltaMs)) * 0.08;

    this.drawWelcomeScreen(deltaMs);

    if (this.running) {
      let remaining = (deltaMs / 1000) * SIMULATION_RATE * this.config.timeScale;
      while (remaining > 0) {
        const actualDt = Math.min(this.config.dt, remaining);
        this.engine.config = this.config;
        this.thermo.config = this.config;
        this.engine.step(actualDt);
        this.simTime += actualDt;
        this.pushTrackedParticleHistory();
        remaining -= actualDt;
      }
      this.pushHistory();
    }

    this.renderer.drawSimulation(
      this.engine,
      this.thermo,
      this.history,
      this.hoveredParticle,
      this.trackedParticleIds
    );
    if (this.graphLayout.visibility.temperature) {
      this.renderer.drawTemperatureGraph(this.history);
    }
    if (this.graphLayout.visibility.tracked) {
      this.renderer.drawTrackedParticleGraph(this.particleHistory);
    }
    if (this.graphLayout.visibility.energy) {
      this.renderer.drawEnergyGraph(this.history);
    }
    this.renderer.updateTooltip(this.hoveredParticle, this.pointer);
    this.renderer.updateOverlay(this.config, this.engine.metrics);
    this.ui.updateReadouts(this.engine.metrics, this.thermo, this.fps, this.running);
    requestAnimationFrame((time) => this.frame(time));
  }
}

new SimulationApp();
