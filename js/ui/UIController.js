import { ENVIRONMENTS } from "../config.js";
import {
  formatElapsedTime,
  formatEnergy,
  formatHeatFlow,
  formatLength,
  formatTemperature,
  formatTemperatureDelta,
  fromDisplayTemperature,
  fmt,
  getTemperatureSliderRange,
  temperatureUnitSymbol,
  toDisplayTemperature
} from "../utils.js";

export class UIController {
  constructor(app) {
    this.app = app;
    this.activeTab = "controls";
    this.elements = this.captureElements();
    this.bind();
    this.activateTab(this.activeTab);
    this.updateLabels();
  }

  captureElements() {
    return {
      metricTemp: document.getElementById("metricTemp"),
      metricTotal: document.getElementById("metricTotal"),
      metricKE: document.getElementById("metricKE"),
      metricPE: document.getElementById("metricPE"),
      metricHeatLoss: document.getElementById("metricHeatLoss"),
      metricHeatFlow: document.getElementById("metricHeatFlow"),
      metricElapsed: document.getElementById("metricElapsed"),
      metricPhase: document.getElementById("metricPhase"),
      metricFPS: document.getElementById("metricFPS"),
      coolingRateReadout: document.getElementById("coolingRateReadout"),
      efficiencyReadout: document.getElementById("efficiencyReadout"),
      boundaryReadout: document.getElementById("boundaryReadout"),
      phaseReadout: document.getElementById("phaseReadout"),
      sourceTempReadout: document.getElementById("sourceTempReadout"),
      ambientTempReadout: document.getElementById("ambientTempReadout"),
      humidityReadout: document.getElementById("humidityReadout"),
      dewPointReadout: document.getElementById("dewPointReadout"),
      condensationReadout: document.getElementById("condensationReadout"),
      evaporationReadout: document.getElementById("evaporationReadout"),
      dripReadout: document.getElementById("dripReadout"),
      timeScaleReadout: document.getElementById("timeScaleReadout"),
      modeBadge: document.getElementById("modeBadge"),
      boundaryBadge: document.getElementById("boundaryBadge"),
      materialBadge: document.getElementById("materialBadge"),
      statusPill: document.getElementById("statusPill"),
      infoFabBtn: document.getElementById("infoFabBtn"),
      infoModalShell: document.getElementById("infoModalShell"),
      infoModalBackdrop: document.getElementById("infoModalBackdrop"),
      infoModalCloseBtn: document.getElementById("infoModalCloseBtn"),
      scenarioSummary: document.getElementById("scenarioSummary"),
      trialBody: document.getElementById("trialBody"),
      startPauseBtn: document.getElementById("startPauseBtn"),
      resetBtn: document.getElementById("resetBtn"),
      boundaryBtn: document.getElementById("boundaryBtn"),
      overlayBtn: document.getElementById("overlayBtn"),
      thermostatBtn: document.getElementById("thermostatBtn"),
      recordTrialBtn: document.getElementById("recordTrialBtn"),
      buildScenarioBtn: document.getElementById("buildScenarioBtn"),
      resetToIceBtn: document.getElementById("resetToIceBtn"),
      startScenarioBtn: document.getElementById("startScenarioBtn"),
      stopScenarioBtn: document.getElementById("stopScenarioBtn"),
      particleFocusInput: document.getElementById("particleFocusInput"),
      applyParticleFocusBtn: document.getElementById("applyParticleFocusBtn"),
      clearParticleFocusBtn: document.getElementById("clearParticleFocusBtn"),
      particleFocusSummary: document.getElementById("particleFocusSummary"),
      trackedGraphLegend: document.getElementById("trackedGraphLegend"),
      temperatureSlider: document.getElementById("temperatureSlider"),
      brushTempSlider: document.getElementById("brushTempSlider"),
      particleCountSlider: document.getElementById("particleCountSlider"),
      epsilonSlider: document.getElementById("epsilonSlider"),
      sigmaSlider: document.getElementById("sigmaSlider"),
      dtSlider: document.getElementById("dtSlider"),
      thicknessSlider: document.getElementById("thicknessSlider"),
      ambientSlider: document.getElementById("ambientSlider"),
      humiditySlider: document.getElementById("humiditySlider"),
      envCoeffSlider: document.getElementById("envCoeffSlider"),
      gravitySlider: document.getElementById("gravitySlider"),
      convectionSlider: document.getElementById("convectionSlider"),
      trailsSlider: document.getElementById("trailsSlider"),
      vectorsSlider: document.getElementById("vectorsSlider"),
      materialSelect: document.getElementById("materialSelect"),
      environmentSelect: document.getElementById("environmentSelect"),
      layoutSelect: document.getElementById("layoutSelect"),
      cupPlacementSelect: document.getElementById("cupPlacementSelect"),
      temperatureUnitSelect: document.getElementById("temperatureUnitSelect"),
      measurementSystemSelect: document.getElementById("measurementSystemSelect"),
      measurementCycleBtn: document.getElementById("measurementCycleBtn"),
      measurementModeValue: document.getElementById("measurementModeValue"),
      timeScaleSelect: document.getElementById("timeScaleSelect"),
      timeScaleBtn: document.getElementById("timeScaleBtn"),
      temperatureValue: document.getElementById("temperatureValue"),
      brushTempValue: document.getElementById("brushTempValue"),
      particleCountValue: document.getElementById("particleCountValue"),
      epsilonValue: document.getElementById("epsilonValue"),
      sigmaValue: document.getElementById("sigmaValue"),
      dtValue: document.getElementById("dtValue"),
      thicknessValue: document.getElementById("thicknessValue"),
      ambientValue: document.getElementById("ambientValue"),
      humidityValue: document.getElementById("humidityValue"),
      envCoeffValue: document.getElementById("envCoeffValue"),
      gravityValue: document.getElementById("gravityValue"),
      convectionValue: document.getElementById("convectionValue"),
      trailValue: document.getElementById("trailValue"),
      vectorValue: document.getElementById("vectorValue"),
      tabButtons: [...document.querySelectorAll("[data-tab-target]")],
      tabPanels: [...document.querySelectorAll("[data-tab-panel]")]
    };
  }

  bind() {
    const e = this.elements;
    const c = this.app.config;

    const bindNumberSlider = (key, input, onChange) => {
      input.addEventListener("input", () => {
        c[key] = Number(input.value);
        this.updateLabels();
        onChange?.("input");
      });
      input.addEventListener("change", () => {
        c[key] = Number(input.value);
        this.updateLabels();
        onChange?.("change");
      });
    };

    const bindTempSlider = (key, input, onChange) => {
      input.addEventListener("input", () => {
        c[key] = fromDisplayTemperature(Number(input.value), c.temperatureUnit);
        this.updateLabels();
        onChange?.("input");
      });
      input.addEventListener("change", () => {
        c[key] = fromDisplayTemperature(Number(input.value), c.temperatureUnit);
        this.updateLabels();
        onChange?.("change");
      });
    };

    e.tabButtons.forEach((button) => {
      button.addEventListener("click", () => this.activateTab(button.dataset.tabTarget));
    });

    e.infoFabBtn?.addEventListener("click", () => this.openInfoModal());
    e.infoModalBackdrop?.addEventListener("click", () => this.closeInfoModal());
    e.infoModalCloseBtn?.addEventListener("click", () => this.closeInfoModal());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeInfoModal();
      }
    });

    e.startPauseBtn.addEventListener("click", () => this.app.toggleRunning());
    e.resetBtn.addEventListener("click", () => this.app.resetSimulation(false));
    e.recordTrialBtn.addEventListener("click", () => this.app.recordTrial());
    e.buildScenarioBtn.addEventListener("click", () => this.app.applyScenario({ start: false }));
    e.resetToIceBtn.addEventListener("click", () => this.app.resetToIceState());
    e.startScenarioBtn.addEventListener("click", () => this.app.applyScenario({ start: true }));
    e.stopScenarioBtn.addEventListener("click", () => this.app.stopScenario());
    e.applyParticleFocusBtn.addEventListener("click", () => this.applyParticleFocus());
    e.clearParticleFocusBtn.addEventListener("click", () => this.clearParticleFocus());
    e.particleFocusInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.applyParticleFocus();
      }
    });

    e.boundaryBtn.addEventListener("click", () => {
      c.boundaryMode = c.boundaryMode === "reflective" ? "periodic" : "reflective";
      this.app.engine.config.boundaryMode = c.boundaryMode;
      this.updateLabels();
    });

    e.overlayBtn.addEventListener("click", () => {
      c.overlay = !c.overlay;
      this.updateLabels();
    });

    e.thermostatBtn.addEventListener("click", () => {
      c.thermostat = !c.thermostat;
      this.app.thermo.setTemperatureTarget(c.temperature);
      this.updateLabels();
    });

    bindTempSlider("temperature", e.temperatureSlider, (kind) => {
      this.app.setSystemTemperature(c.temperature, { immediate: false });
      if (kind === "change") {
        this.app.refreshStartingTemperature();
      }
    });
    bindTempSlider("brushTemperature", e.brushTempSlider);
    bindNumberSlider("particleCount", e.particleCountSlider, (kind) => {
      if (kind === "change") this.app.resetSimulation(false);
    });
    bindNumberSlider("epsilon", e.epsilonSlider);
    bindNumberSlider("sigma", e.sigmaSlider, (kind) => {
      if (kind === "change") this.app.resetSimulation(false);
    });
    bindNumberSlider("dt", e.dtSlider);
    bindNumberSlider("cupThickness", e.thicknessSlider, () => this.app.previewScenario());
    bindTempSlider("ambientTemp", e.ambientSlider, () => this.app.previewScenario());
    bindNumberSlider("ambientHumidity", e.humiditySlider, () => this.app.previewScenario());
    bindNumberSlider("envCoeff", e.envCoeffSlider, () => this.app.previewScenario());
    bindNumberSlider("gravityStrength", e.gravitySlider);
    bindNumberSlider("convectionStrength", e.convectionSlider);
    bindNumberSlider("trailStrength", e.trailsSlider, () => {
      c.trails = c.trailStrength > 0;
    });
    bindNumberSlider("vectors", e.vectorsSlider, () => {
      c.vectors = Number(e.vectorsSlider.value) > 0;
    });

    e.materialSelect.addEventListener("change", () => {
      c.material = e.materialSelect.value;
      this.updateLabels();
      this.app.previewScenario();
    });

    e.environmentSelect.addEventListener("change", () => {
      c.environment = e.environmentSelect.value;
      const preset = ENVIRONMENTS[c.environment];
      c.ambientTemp = preset.ambient;
      c.envCoeff = preset.coeff;
      c.ambientHumidity = preset.humidity;
      this.updateLabels();
      this.app.previewScenario();
    });

    e.layoutSelect.addEventListener("change", () => {
      c.cupPresent = e.layoutSelect.value === "cup";
      this.updateLabels();
      this.app.previewScenario();
    });

    e.cupPlacementSelect.addEventListener("change", () => {
      c.cupPlacement = e.cupPlacementSelect.value;
      this.updateLabels();
      this.app.previewScenario();
    });

    e.temperatureUnitSelect?.addEventListener("change", () => {
      c.temperatureUnit = e.temperatureUnitSelect.value;
      this.updateLabels();
    });

    e.measurementSystemSelect?.addEventListener("change", () => {
      c.measurementSystem = e.measurementSystemSelect.value;
      c.energyUnit = c.measurementSystem === "imperial" ? "cal" : "J";
      this.updateLabels();
    });

    e.measurementCycleBtn?.addEventListener("click", () => {
      this.cycleMeasurementMode();
    });

    e.timeScaleSelect?.addEventListener("change", () => {
      c.timeScale = Number(e.timeScaleSelect.value);
      this.updateLabels();
    });

    e.timeScaleBtn?.addEventListener("click", () => {
      this.cycleTimeScale();
    });
  }

  activateTab(tabName) {
    this.activeTab = tabName;
    this.elements.tabButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tabTarget === tabName);
    });
    this.elements.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
    });
  }

  openInfoModal() {
    this.elements.infoModalShell?.classList.add("open");
    this.elements.infoModalShell?.setAttribute("aria-hidden", "false");
  }

  closeInfoModal() {
    this.elements.infoModalShell?.classList.remove("open");
    this.elements.infoModalShell?.setAttribute("aria-hidden", "true");
  }

  applyTemperatureSliderRanges() {
    const { temperatureUnit } = this.app.config;
    const range = getTemperatureSliderRange(temperatureUnit);
    [this.elements.temperatureSlider, this.elements.brushTempSlider, this.elements.ambientSlider].forEach((input) => {
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
    });
  }

  cycleMeasurementMode() {
    const c = this.app.config;
    const modes = [
      { temperatureUnit: "C", measurementSystem: "metric", energyUnit: "J" },
      { temperatureUnit: "F", measurementSystem: "imperial", energyUnit: "cal" },
      { temperatureUnit: "K", measurementSystem: "metric", energyUnit: "J" }
    ];
    const currentIndex = modes.findIndex(
      (mode) => mode.temperatureUnit === c.temperatureUnit && mode.measurementSystem === c.measurementSystem
    );
    const next = modes[(currentIndex + 1 + modes.length) % modes.length];
    c.temperatureUnit = next.temperatureUnit;
    c.measurementSystem = next.measurementSystem;
    c.energyUnit = next.energyUnit;
    this.updateLabels();
  }

  cycleTimeScale() {
    const c = this.app.config;
    const scales = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
    const index = scales.findIndex((value) => value === c.timeScale);
    c.timeScale = scales[(index + 1 + scales.length) % scales.length];
    this.updateLabels();
  }

  getMeasurementModeLabel() {
    const { temperatureUnit, measurementSystem, energyUnit } = this.app.config;
    const systemLabel = measurementSystem === "imperial" ? "Imperial" : "Metric";
    const temperatureLabel = temperatureUnit === "F" ? "Fahrenheit" : temperatureUnit === "K" ? "Kelvin" : "Celsius";
    const energyLabel = energyUnit === "cal" ? "Calories" : "Joules";
    return `${systemLabel} / ${temperatureLabel} / ${energyLabel}`;
  }

  getTrackedSeriesPalette() {
    return ["#1f7ae0", "#de5b34", "#1d9d7e", "#8b58d8", "#c38a1d", "#c1467a", "#3477c2", "#5f9b2c"];
  }

  formatMassRate(kgPerS) {
    const gPerS = kgPerS * 1000;
    if (Math.abs(gPerS) >= 0.01) {
      return `${fmt(gPerS, 2)} g/s`;
    }
    return `${fmt(kgPerS * 1e6, 2)} mg/s`;
  }

  getStatusText(running) {
    const c = this.app.config;
    if (!running) {
      return "Scenario paused";
    }
    return `Scenario running in real time at ${fmt(c.timeScale, 2)}x | ${c.environment} room | ${c.cupPresent ? c.material : "tray"} setup`;
  }

  updateLabels() {
    const e = this.elements;
    const c = this.app.config;
    c.energyUnit = c.measurementSystem === "imperial" ? "cal" : "J";

    this.applyTemperatureSliderRanges();

    e.temperatureValue.textContent = formatTemperature(c.temperature, c.temperatureUnit, 0);
    e.brushTempValue.textContent = formatTemperature(c.brushTemperature, c.temperatureUnit, 0);
    e.particleCountValue.textContent = `${c.particleCount}`;
    e.epsilonValue.textContent = fmt(c.epsilon, 2);
    e.sigmaValue.textContent = fmt(c.sigma, 1);
    e.dtValue.textContent = `${fmt(c.dt, 3)} s`;
    e.thicknessValue.textContent = formatLength(c.cupThickness, c.measurementSystem, 2);
    e.ambientValue.textContent = formatTemperature(c.ambientTemp, c.temperatureUnit, 0);
    e.humidityValue.textContent = `${fmt(c.ambientHumidity, 0)}%`;
    e.envCoeffValue.textContent = fmt(c.envCoeff, 2);
    e.gravityValue.textContent = fmt(c.gravityStrength, 2);
    e.convectionValue.textContent = fmt(c.convectionStrength, 2);
    e.trailValue.textContent = `${Math.round(c.trailStrength * 100)}%`;
    e.vectorValue.textContent = c.vectors ? "On" : "Off";

    e.modeBadge.textContent = `Brush: ${formatTemperature(c.brushTemperature, c.temperatureUnit, 0)}`;
    e.boundaryBadge.textContent = `Boundary: ${c.boundaryMode === "reflective" ? "Reflective" : "Periodic"}`;
    e.materialBadge.textContent = c.cupPresent ? `Cup: ${c.material}` : "Layout: Open Tray";
    e.boundaryReadout.textContent = c.boundaryMode === "reflective" ? "Reflective" : "Periodic";

    e.overlayBtn.classList.toggle("active", c.overlay);
    e.thermostatBtn.classList.toggle("active", c.thermostat);
    e.thermostatBtn.textContent = c.thermostat ? "Inside Source Active" : "Inside Temp Sets Start";

    e.temperatureSlider.value = String(Math.round(toDisplayTemperature(c.temperature, c.temperatureUnit)));
    e.brushTempSlider.value = String(Math.round(toDisplayTemperature(c.brushTemperature, c.temperatureUnit)));
    e.ambientSlider.value = String(Math.round(toDisplayTemperature(c.ambientTemp, c.temperatureUnit)));
    e.humiditySlider.value = String(Math.round(c.ambientHumidity));
    e.gravitySlider.value = String(c.gravityStrength);
    e.convectionSlider.value = String(c.convectionStrength);
    e.trailsSlider.value = String(c.trailStrength);
    e.vectorsSlider.value = c.vectors ? "1" : "0";
    e.thicknessSlider.value = String(c.cupThickness);
    e.envCoeffSlider.value = String(c.envCoeff);
    e.layoutSelect.value = c.cupPresent ? "cup" : "tray";
    e.cupPlacementSelect.value = c.cupPlacement;
    e.materialSelect.value = c.material;
    e.environmentSelect.value = c.environment;
    if (e.temperatureUnitSelect) e.temperatureUnitSelect.value = c.temperatureUnit;
    if (e.measurementSystemSelect) e.measurementSystemSelect.value = c.measurementSystem;
    if (e.measurementModeValue) e.measurementModeValue.textContent = this.getMeasurementModeLabel();
    if (e.measurementCycleBtn) e.measurementCycleBtn.textContent = `Units: ${c.temperatureUnit}`;
    if (e.timeScaleSelect) e.timeScaleSelect.value = String(c.timeScale);
    if (e.timeScaleReadout) e.timeScaleReadout.textContent = `${fmt(c.timeScale, 2)}x`;
    if (e.timeScaleBtn) e.timeScaleBtn.textContent = `Time Scale: ${fmt(c.timeScale, c.timeScale % 1 === 0 ? 0 : 1)}x`;

    e.scenarioSummary.textContent = c.cupPresent
      ? `Cup experiment selected. The sample starts at the chosen inside temperature inside a ${c.material.toLowerCase()} cup placed ${c.cupPlacement}. From there, the outside temperature, wall conductivity, thickness, and open top all drive real-time cooling or warming.`
      : "Open tray selected. The sample starts at the chosen inside temperature in a shallow tray, then changes in real time as the room, humidity, and open surface exchange heat and moisture with it.";
  }

  updateReadouts(stats, thermo, fps, running) {
    const e = this.elements;
    const c = this.app.config;
    const tempRateUnit = `${temperatureUnitSymbol(c.temperatureUnit)}/s`;

    e.metricTemp.textContent = formatTemperature(stats.temperature, c.temperatureUnit, 1);
    e.metricTotal.textContent = fmt(stats.total, 1);
    e.metricKE.textContent = fmt(stats.kinetic, 1);
    e.metricPE.textContent = fmt(stats.potential, 1);
    e.metricHeatLoss.textContent = formatEnergy(thermo.heatLost, c.energyUnit, 1);
    if (e.metricHeatFlow) e.metricHeatFlow.textContent = formatHeatFlow(thermo.lastHeatFlow, c.energyUnit, 1);
    if (e.metricElapsed) e.metricElapsed.textContent = formatElapsedTime(this.app.simTime);
    e.metricPhase.textContent = stats.phase;
    e.metricFPS.textContent = `${Math.round(fps)}`;
    e.coolingRateReadout.textContent = `${fmt(
      c.temperatureUnit === "F" ? thermo.lastCoolingRate * 9 / 5 : thermo.lastCoolingRate,
      2
    )} ${tempRateUnit}`;
    e.efficiencyReadout.textContent = `${fmt(thermo.insulationScore, 0)}%`;
    e.phaseReadout.textContent = stats.phase;
    e.sourceTempReadout.textContent = formatTemperature(c.temperature, c.temperatureUnit, 1);
    e.ambientTempReadout.textContent = formatTemperature(c.ambientTemp, c.temperatureUnit, 1);
    if (e.humidityReadout) e.humidityReadout.textContent = `${fmt(c.ambientHumidity, 0)}%`;
    if (e.dewPointReadout) e.dewPointReadout.textContent = formatTemperature(thermo.dewPoint, c.temperatureUnit, 1);
    if (e.condensationReadout) e.condensationReadout.textContent = this.formatMassRate(thermo.condensationRateKgPerS);
    if (e.evaporationReadout) e.evaporationReadout.textContent = this.formatMassRate(thermo.sampleEvaporationRateKgPerS);
    if (e.dripReadout) e.dripReadout.textContent = `${thermo.fallingDroplets.length}`;
    e.statusPill.textContent = this.getStatusText(running);
    e.startPauseBtn.textContent = running ? "Pause Simulation" : "Resume Simulation";
    e.startScenarioBtn.classList.toggle("active", running);
    e.stopScenarioBtn.classList.toggle("active", !running);
    const trackedParticles = this.app.getTrackedParticles();
    this.renderTrackedParticleSummary(trackedParticles, this.app.trackedParticleInput);
    this.renderTrackedGraphLegend(trackedParticles);
  }

  applyParticleFocus() {
    const raw = this.elements.particleFocusInput.value.trim();
    this.app.setTrackedParticlesFromInput(raw);
    this.renderTrackedParticleSummary(this.app.getTrackedParticles(), raw);
  }

  clearParticleFocus() {
    this.elements.particleFocusInput.value = "";
    this.app.clearTrackedParticles();
    this.renderTrackedParticleSummary([], "");
  }

  renderTrackedParticleSummary(particles, rawInput) {
    const summary = this.elements.particleFocusSummary;
    const { temperatureUnit } = this.app.config;
    if (!rawInput) {
      summary.textContent = "No particles selected.";
      return;
    }

    if (!particles.length) {
      summary.textContent = "No matching particle numbers were found in the current sample.";
      return;
    }

    summary.innerHTML = `
      <div class="focus-summary-head">
        <span class="focus-summary-count">Tracking ${particles.length} particle${particles.length === 1 ? "" : "s"}</span>
        <span class="focus-summary-note">Use the tracked graph below to compare all selected temperatures together.</span>
      </div>
      <div class="focus-chip-row">
        ${particles
          .map(
            (particle) =>
              `<span class="focus-chip">#${particle.id} | ${formatTemperature(particle.temperature, temperatureUnit, 1)} | speed ${fmt(
                particle.speed,
                2
              )}</span>`
          )
          .join("")}
      </div>
    `;
  }

  renderTrackedGraphLegend(particles) {
    const legend = this.elements.trackedGraphLegend;
    if (!legend) {
      return;
    }

    if (!particles.length) {
      legend.innerHTML = `<div class="tracked-legend-item empty">Tracked particle lines will appear here when you select molecules.</div>`;
      return;
    }

    const { temperatureUnit } = this.app.config;
    const palette = this.getTrackedSeriesPalette();
    legend.innerHTML = `
      <div class="tracked-legend-head">
        <div class="tracked-legend-count">Tracked lines: ${particles.length}</div>
        <div class="tracked-legend-note">Every selected particle is drawn on the same graph with its own color.</div>
      </div>
      <div class="tracked-legend-list">
        ${particles
          .map(
            (particle, index) => `
              <div class="tracked-legend-item">
                <span class="tracked-legend-swatch" style="background:${palette[index % palette.length]}"></span>
                <div class="tracked-legend-copy">
                  <div class="tracked-legend-title">#${particle.id}</div>
                  <div class="tracked-legend-meta">
                    <span>${formatTemperature(particle.temperature, temperatureUnit, 1)}</span>
                    <span>speed ${fmt(particle.speed, 2)}</span>
                    <span>n ${particle.neighbors}</span>
                  </div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  renderTrialTable(trials) {
    const body = this.elements.trialBody;
    const { temperatureUnit, energyUnit } = this.app.config;
    body.innerHTML = "";
    if (!trials.length) {
      body.innerHTML = `<tr><td colspan="5">No trials recorded yet.</td></tr>`;
      return;
    }

    for (const trial of trials.slice(-5).reverse()) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${trial.material}</td>
        <td>${formatTemperatureDelta(trial.deltaT, temperatureUnit, 1)}</td>
        <td>${formatEnergy(trial.heatLoss, energyUnit, 1)}</td>
        <td>${fmt(temperatureUnit === "F" ? trial.coolingRate * 9 / 5 : trial.coolingRate, 2)} ${temperatureUnitSymbol(temperatureUnit)}/s</td>
        <td>${fmt(trial.score, 0)}%</td>
      `;
      body.appendChild(row);
    }
  }
}
