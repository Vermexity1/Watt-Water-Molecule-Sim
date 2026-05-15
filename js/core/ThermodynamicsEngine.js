import {
  BOILING_POINT,
  ENVIRONMENTS,
  FREEZING_POINT,
  ICE_DENSITY,
  ICE_SPECIFIC_HEAT,
  LATENT_HEAT_FUSION,
  LATENT_HEAT_SUBLIMATION,
  LATENT_HEAT_VAPORIZATION,
  MATERIALS,
  SPECIFIC_HEAT,
  STEAM_SPECIFIC_HEAT,
  WATER_DENSITY
} from "../config.js";
import { absoluteToDisplay, clamp, lerp, speed2ToTemperature } from "../utils.js";

export class ThermodynamicsEngine {
  constructor(config) {
    this.config = config;
    this.localZones = [];
    this.dragField = null;
    this.heatLost = 0;
    this.bulkTargetTemp = config.temperature;
    this.initialTemp = config.temperature;
    this.elapsed = 0;
    this.lastCoolingRate = 0;
    this.insulationScore = 100;
    this.lastHeatFlow = 0;
    this.lastSourcePower = 0;
    this.lastNetPower = 0;
    this.cupWallTemperature = config.ambientTemp;
    this.condensationLevel = 0;
    this.dewPoint = config.ambientTemp;
    this.condensationRateKgPerS = 0;
    this.surfaceEvaporationRateKgPerS = 0;
    this.sampleEvaporationRateKgPerS = 0;
    this.clearAtmosphericWaterState();
    this.sampleTemperature = config.temperature;
    this.sampleSpecificEnthalpy = this.temperatureToSpecificEnthalpy(config.temperature);
    this.phaseState = this.enthalpyToState(this.sampleSpecificEnthalpy);
    this.sampleMassKg = 0.24;
    this.thermalCapacity = this.sampleMassKg * SPECIFIC_HEAT;
  }

  clearAtmosphericWaterState() {
    this.externalWaterMassKg = 0;
    this.wallFilmMassKg = 0;
    this.precipitatedMassKg = 0;
    this.wallDroplets = [];
    this.fallingDroplets = [];
    this.vaporParticles = [];
    this.splashParticles = [];
    this.nextDropletId = 0;
  }

  reset(config, options = {}) {
    const { startMode = "selected" } = options;
    this.config = config;
    this.localZones = [];
    this.dragField = null;
    this.heatLost = 0;
    this.bulkTargetTemp = config.temperature;
    const startTemp = startMode === "ice" ? config.initialIceTemperature : config.temperature;
    this.initialTemp = startTemp;
    this.elapsed = 0;
    this.lastCoolingRate = 0;
    this.insulationScore = 100;
    this.lastHeatFlow = 0;
    this.lastSourcePower = 0;
    this.lastNetPower = 0;
    this.cupWallTemperature = config.ambientTemp;
    this.condensationLevel = 0;
    this.dewPoint = config.ambientTemp;
    this.condensationRateKgPerS = 0;
    this.surfaceEvaporationRateKgPerS = 0;
    this.sampleEvaporationRateKgPerS = 0;
    this.externalWaterMassKg = 0;
    this.wallFilmMassKg = 0;
    this.precipitatedMassKg = 0;
    this.wallDroplets = [];
    this.fallingDroplets = [];
    this.vaporParticles = [];
    this.splashParticles = [];
    this.nextDropletId = 0;
    this.sampleTemperature = startTemp;
    this.sampleSpecificEnthalpy = this.temperatureToSpecificEnthalpy(startTemp);
    this.phaseState = this.enthalpyToState(this.sampleSpecificEnthalpy);
    this.sampleMassKg = 0.24;
    this.thermalCapacity = this.sampleMassKg * SPECIFIC_HEAT;
  }

  setTemperatureTarget(temp) {
    this.bulkTargetTemp = temp;
  }

  addZone(x, y, targetTemperature) {
    const intensity = clamp(targetTemperature - this.sampleTemperature, -420, 420);
    this.localZones.push({
      x,
      y,
      radius: 96,
      intensity,
      kind: targetTemperature >= this.bulkTargetTemp ? "heat" : "cold",
      targetTemperature,
      ttl: 8
    });
  }

  setDragField(field) {
    this.dragField = field;
  }

  clearDragField() {
    this.dragField = null;
  }

  saturationVaporPressure(temperature) {
    const celsius = temperature - 273.15;
    if (celsius >= 0) {
      // Buck (1981) equation over liquid water, as summarized in NOAA PSD-311.
      return 100 * 6.1121 * (1.0007 + 3.46e-6 * 1013.25) * Math.exp((17.502 * celsius) / (240.97 + celsius));
    }
    // Buck form over ice for subfreezing surfaces.
    return 100 * 6.1115 * (1.0003 + 4.18e-6 * 1013.25) * Math.exp((22.452 * celsius) / (272.55 + celsius));
  }

  dewPointFromTempHumidity(temperature, relativeHumidity) {
    const celsius = temperature - 273.15;
    const humidity = clamp(relativeHumidity, 1, 100);
    const a = 17.625;
    const b = 243.04;
    const gamma = Math.log(humidity / 100) + (a * celsius) / (b + celsius);
    const dewPointC = (b * gamma) / (a - gamma);
    return dewPointC + 273.15;
  }

  airProperties(temperature) {
    const pressure = 101325;
    const rho = pressure / (287.05 * temperature);
    const mu = 1.716e-5 * Math.pow(temperature / 273.15, 1.5) * ((273.15 + 111) / (temperature + 111));
    const cp = 1006;
    const conductivity = clamp(0.0241 + 7.73e-5 * (temperature - 273.15), 0.021, 0.034);
    const alpha = conductivity / Math.max(1e-9, rho * cp);
    const nu = mu / Math.max(1e-9, rho);
    const diffusivity = 2.5e-5 * Math.pow(temperature / 273.15, 1.81);
    const pr = nu / Math.max(1e-9, alpha);
    const sc = nu / Math.max(1e-9, diffusivity);
    return {
      pressure,
      rho,
      mu,
      cp,
      conductivity,
      alpha,
      nu,
      diffusivity,
      pr,
      sc
    };
  }

  convectionCoefficientVertical(surfaceTemp, ambientTemp, lengthM) {
    const deltaT = Math.abs(surfaceTemp - ambientTemp);
    const filmTemp = (surfaceTemp + ambientTemp) * 0.5;
    const air = this.airProperties(filmTemp);
    if (deltaT < 0.05) {
      return air.conductivity / Math.max(0.002, lengthM);
    }
    const rayleigh = clamp(
      (9.80665 * (1 / filmTemp) * deltaT * Math.pow(lengthM, 3)) / Math.max(1e-12, air.nu * air.alpha),
      1e-3,
      1e12
    );
    const nuBar = Math.pow(
      0.825 +
      (0.387 * Math.pow(rayleigh, 1 / 6)) /
      Math.pow(1 + Math.pow(0.492 / Math.max(0.01, air.pr), 9 / 16), 8 / 27),
      2
    );
    return (nuBar * air.conductivity) / Math.max(0.002, lengthM);
  }

  convectionCoefficientHorizontal(surfaceTemp, ambientTemp, lengthM) {
    const deltaT = Math.abs(surfaceTemp - ambientTemp);
    const filmTemp = (surfaceTemp + ambientTemp) * 0.5;
    const air = this.airProperties(filmTemp);
    if (deltaT < 0.05) {
      return air.conductivity / Math.max(0.002, lengthM);
    }
    const rayleigh = clamp(
      (9.80665 * (1 / filmTemp) * deltaT * Math.pow(lengthM, 3)) / Math.max(1e-12, air.nu * air.alpha),
      1e-3,
      1e11
    );
    // Upper-face natural convection correlation summarized in the MIT review of plate convection.
    const nuBar = Math.pow(0.642 + 0.370 * Math.pow(rayleigh, 1 / 6), 2);
    return (nuBar * air.conductivity) / Math.max(0.002, lengthM);
  }

  massTransferCoefficient(heatTransferCoefficient, air) {
    const lewis = air.alpha / Math.max(1e-9, air.diffusivity);
    return heatTransferCoefficient / Math.max(1e-9, air.rho * air.cp * Math.pow(lewis, 2 / 3));
  }

  waterVaporDensity(partialPressure, temperature) {
    return partialPressure / Math.max(1e-9, 461.52 * temperature);
  }

  waterSurfaceTension(temperature) {
    const celsius = clamp(temperature - 273.15, 0, 100);
    return clamp(0.0756 - 0.000157 * celsius, 0.058, 0.0756);
  }

  dropletRadiusPx(massKg) {
    return clamp(1.6 + Math.cbrt(Math.max(0, massKg) * 1.2e9) * 0.62, 1.4, 8.6);
  }

  createWallDroplet(visualBounds, side, yBias = 0.2) {
    const height = visualBounds.maxY - visualBounds.minY;
    const travel = clamp(yBias, 0, 1);
    const y = lerp(visualBounds.minY + 18, visualBounds.maxY - 28, travel);
    const x =
      side === "left"
        ? visualBounds.minX + 6 + Math.random() * 4
        : visualBounds.maxX - 6 - Math.random() * 4;
    return {
      id: this.nextDropletId++,
      side,
      x,
      y,
      vyMps: 0,
      massKg: 0,
      stuck: true,
      life: 1,
      lengthNorm: (y - visualBounds.minY) / Math.max(1, height)
    };
  }

  spawnSplash(x, y, massKg) {
    const count = Math.max(2, Math.min(7, Math.round(this.dropletRadiusPx(massKg))));
    for (let index = 0; index < count; index += 1) {
      if (this.splashParticles.length > 140) {
        break;
      }
      this.splashParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 34,
        vy: -26 - Math.random() * 38,
        radius: 1 + Math.random() * 1.6,
        alpha: 0.34 + Math.random() * 0.26,
        ttl: 0.35 + Math.random() * 0.35
      });
    }
  }

  spawnVapor(visualBounds, intensity, dt) {
    const count = Math.max(0, Math.min(6, Math.round(intensity * dt * 18)));
    const sourceWidth = (visualBounds.maxX - visualBounds.minX) * 0.56;
    const centerX = (visualBounds.minX + visualBounds.maxX) * 0.5;
    const baseY = visualBounds.minY + 18;
    for (let index = 0; index < count; index += 1) {
      if (this.vaporParticles.length > 260) {
        break;
      }
      this.vaporParticles.push({
        x: centerX + (Math.random() - 0.5) * sourceWidth,
        y: baseY + Math.random() * 10,
        vx: (Math.random() - 0.5) * 10,
        vy: -16 - Math.random() * 24,
        radius: 4 + Math.random() * 6,
        alpha: 0.08 + Math.random() * 0.09,
        ttl: 0.8 + Math.random() * 0.9
      });
    }
  }

  computeSampleMassKg(particles) {
    const particleScale = particles.length / Math.max(180, this.config.particleCount);
    const volumeM3 = (this.config.cupPresent ? 1.8e-4 : 2.6e-4) * particleScale;
    const density = this.sampleTemperature <= FREEZING_POINT ? ICE_DENSITY : WATER_DENSITY;
    return clamp(volumeM3 * density, 0.08, 0.35);
  }

  temperatureToSpecificEnthalpy(temperature) {
    if (temperature < FREEZING_POINT) {
      return (temperature - FREEZING_POINT) * ICE_SPECIFIC_HEAT;
    }
    if (temperature < BOILING_POINT) {
      return LATENT_HEAT_FUSION + (temperature - FREEZING_POINT) * SPECIFIC_HEAT;
    }
    return (
      LATENT_HEAT_FUSION +
      SPECIFIC_HEAT * (BOILING_POINT - FREEZING_POINT) +
      LATENT_HEAT_VAPORIZATION +
      (temperature - BOILING_POINT) * STEAM_SPECIFIC_HEAT
    );
  }

  enthalpyToState(enthalpy) {
    const liquidStart = LATENT_HEAT_FUSION;
    const vaporStart = liquidStart + SPECIFIC_HEAT * (BOILING_POINT - FREEZING_POINT);
    const vaporEnd = vaporStart + LATENT_HEAT_VAPORIZATION;

    if (enthalpy < 0) {
      return {
        temperature: FREEZING_POINT + enthalpy / ICE_SPECIFIC_HEAT,
        solid: 1,
        liquid: 0,
        gas: 0,
        effectiveCp: ICE_SPECIFIC_HEAT,
        phaseLabel: "Solid-like"
      };
    }

    if (enthalpy < liquidStart) {
      const liquidFraction = clamp(enthalpy / LATENT_HEAT_FUSION, 0, 1);
      return {
        temperature: FREEZING_POINT,
        solid: 1 - liquidFraction,
        liquid: liquidFraction,
        gas: 0,
        effectiveCp: LATENT_HEAT_FUSION,
        phaseLabel: liquidFraction < 0.5 ? "Solid-like" : "Liquid-like"
      };
    }

    if (enthalpy < vaporStart) {
      return {
        temperature: FREEZING_POINT + (enthalpy - liquidStart) / SPECIFIC_HEAT,
        solid: 0,
        liquid: 1,
        gas: 0,
        effectiveCp: SPECIFIC_HEAT,
        phaseLabel: "Liquid-like"
      };
    }

    if (enthalpy < vaporEnd) {
      const gasFraction = clamp((enthalpy - vaporStart) / LATENT_HEAT_VAPORIZATION, 0, 1);
      return {
        temperature: BOILING_POINT,
        solid: 0,
        liquid: 1 - gasFraction,
        gas: gasFraction,
        effectiveCp: LATENT_HEAT_VAPORIZATION,
        phaseLabel: gasFraction > 0.55 ? "Gas-like" : "Liquid-like"
      };
    }

    return {
      temperature: BOILING_POINT + (enthalpy - vaporEnd) / STEAM_SPECIFIC_HEAT,
      solid: 0,
      liquid: 0,
      gas: 1,
      effectiveCp: STEAM_SPECIFIC_HEAT,
      phaseLabel: "Gas-like"
    };
  }

  getGeometry() {
    if (this.config.cupPresent) {
      const radiusM = 0.035;
      const heightM = 0.09;
      return {
        sideArea: 2 * Math.PI * radiusM * heightM,
        bottomArea: Math.PI * radiusM * radiusM,
        topArea: Math.PI * radiusM * radiusM,
        sourceArea: 0.005
      };
    }

    const widthM = 0.12;
    const lengthM = 0.12;
    const depthM = 0.025;
    return {
      sideArea: 2 * depthM * (widthM + lengthM),
      bottomArea: widthM * lengthM,
      topArea: widthM * lengthM,
      sourceArea: 0.008
    };
  }

  computeHeatExchange(state) {
    const material = MATERIALS[this.config.material];
    const geometry = this.getGeometry();
    const wallArea = geometry.sideArea + geometry.bottomArea;
    const topArea = geometry.topArea;
    const radiativeArea = wallArea + topArea;
    const thicknessM = Math.max(0.0005, this.config.cupThickness / 1000);
    const sampleTemp = state.temperature;
    const ambientRH = clamp(this.config.ambientHumidity, 1, 100);
    const ambientVaporPressure = this.saturationVaporPressure(this.config.ambientTemp) * ambientRH / 100;
    const wallHeight = this.config.cupPresent ? 0.09 : 0.06;
    const topLength = Math.sqrt(topArea);
    const outsideAir = this.airProperties((sampleTemp + this.config.ambientTemp) * 0.5);
    const hInsideWall = state.liquid > 0.6 ? 120 : state.gas > 0.4 ? 30 : 18;
    const hOutsideAir = this.convectionCoefficientVertical(this.cupWallTemperature || sampleTemp, this.config.ambientTemp, wallHeight) * this.config.envCoeff;
    const insideWallResistance = 1 / Math.max(0.001, hInsideWall * wallArea);
    const wallResistance = this.config.cupPresent
      ? thicknessM / Math.max(1e-6, material.k * wallArea)
      : 0;
    const outsideWallResistance = 1 / Math.max(0.001, hOutsideAir * wallArea);
    const wallConductance = 1 / Math.max(1e-6, insideWallResistance + wallResistance + outsideWallResistance);

    const topH = this.convectionCoefficientHorizontal(sampleTemp, this.config.ambientTemp, topLength) * this.config.envCoeff;
    const topConductance = topH * topArea;
    const sourceH = this.config.cupPresent ? 95 : 120;
    const sourceConductance = this.config.thermostat ? sourceH * geometry.sourceArea : 0;
    const sourcePower = this.config.thermostat ? sourceConductance * (this.bulkTargetTemp - sampleTemp) : 0;
    const wallBlend = this.config.cupPresent
      ? clamp(wallConductance / Math.max(0.01, wallConductance + topConductance + sourceConductance), 0.10, 0.9)
      : 0;
    const estimatedWallTemperature = this.config.cupPresent
      ? this.config.ambientTemp + (sampleTemp - this.config.ambientTemp) * wallBlend
      : this.config.ambientTemp;

    const topSaturationPressure = this.saturationVaporPressure(sampleTemp);
    const wallSaturationPressure = this.saturationVaporPressure(estimatedWallTemperature);
    const vaporDensityAmbient = this.waterVaporDensity(ambientVaporPressure, this.config.ambientTemp);
    const vaporDensityTopSurface = this.waterVaporDensity(topSaturationPressure, sampleTemp);
    const vaporDensityWallSurface = this.waterVaporDensity(wallSaturationPressure, estimatedWallTemperature);
    const hMassTop = this.massTransferCoefficient(topH, outsideAir);
    const hMassWall = this.massTransferCoefficient(hOutsideAir, outsideAir);
    const sampleEvaporationRateKgPerS = Math.max(
      0,
      hMassTop * topArea * Math.max(0, vaporDensityTopSurface - vaporDensityAmbient) * (0.25 + state.liquid * 0.95 + state.gas * 0.4)
    );
    const condensationRateKgPerS = this.config.cupPresent
      ? Math.max(0, hMassWall * wallArea * Math.max(0, vaporDensityAmbient - vaporDensityWallSurface))
      : 0;
    const wallEvaporationRateKgPerS = this.config.cupPresent
      ? Math.max(0, hMassWall * wallArea * Math.max(0, vaporDensityWallSurface - vaporDensityAmbient))
      : 0;
    const latentLoss = sampleEvaporationRateKgPerS * (sampleTemp <= FREEZING_POINT ? LATENT_HEAT_SUBLIMATION : LATENT_HEAT_VAPORIZATION);
    const condensationRecovery = condensationRateKgPerS * LATENT_HEAT_VAPORIZATION * wallBlend * 0.22;
    const stefanBoltzmann = 5.670374419e-8;
    const effectiveEmissivity = this.config.cupPresent ? material.emissivity : 0.96;
    const radiationPower = effectiveEmissivity * stefanBoltzmann * radiativeArea *
      (Math.pow(this.config.ambientTemp, 4) - Math.pow(sampleTemp, 4));

    const ambientPower =
      wallConductance * (this.config.ambientTemp - sampleTemp) +
      topConductance * (this.config.ambientTemp - sampleTemp);
    const solarGain = ENVIRONMENTS[this.config.environment].solarGain * topArea;
    const environmentPower = ambientPower + radiationPower + solarGain - latentLoss + condensationRecovery;

    return {
      sourcePower,
      environmentPower,
      netPower: sourcePower + environmentPower,
      outsideConductance: wallConductance + topConductance,
      wallBlend,
      estimatedWallTemperature,
      condensationRateKgPerS,
      sampleEvaporationRateKgPerS,
      wallEvaporationRateKgPerS,
      radiationPower,
      dewPoint: this.dewPointFromTempHumidity(this.config.ambientTemp, ambientRH),
      phase: state
    };
  }

  syncAtmosphereState(state, exchange) {
    this.phaseState = state;
    this.sampleTemperature = state.temperature;
    this.dewPoint = exchange.dewPoint;
    this.condensationRateKgPerS = exchange.condensationRateKgPerS;
    this.surfaceEvaporationRateKgPerS = exchange.wallEvaporationRateKgPerS;
    this.sampleEvaporationRateKgPerS = exchange.sampleEvaporationRateKgPerS;
    this.cupWallTemperature = this.config.cupPresent
      ? exchange.estimatedWallTemperature
      : this.config.ambientTemp;

    const sampleC = state.temperature - 273.15;
    const wallC = this.cupWallTemperature - 273.15;
    const dewPointC = this.dewPoint - 273.15;
    const dewGap = clamp((dewPointC - wallC) / 12, 0, 1);
    const moistureStrength = clamp(exchange.condensationRateKgPerS * 180000, 0, 1);
    const isCondensing = dewPointC > wallC + 0.15;
    this.condensationLevel = this.config.cupPresent
      ? (isCondensing ? clamp(0.16 + dewGap * 0.58 + moistureStrength * 0.44, 0, 1) : 0)
      : 0;
  }

  primeVisualState(bounds, visualBounds, particleCount) {
    const pseudoParticles = { length: particleCount ?? this.config.particleCount };
    this.sampleMassKg = this.computeSampleMassKg(pseudoParticles);
    const state = this.enthalpyToState(this.sampleSpecificEnthalpy);
    this.thermalCapacity = this.sampleMassKg * Math.max(1, state.effectiveCp);
    const exchange = this.computeHeatExchange(state);
    this.syncAtmosphereState(state, exchange);

    this.wallFilmMassKg = 0;
    this.wallDroplets = [];
    this.fallingDroplets = [];
    this.vaporParticles = [];
    this.externalWaterMassKg = 0;
    this.condensationLevel = 0;
  }

  applyForceFields(particles, bounds, currentTemp) {
    const gravity = 180 * this.config.gravityStrength;
    const drag = this.dragField;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    for (const particle of particles) {
      if (gravity) {
        particle.fy += gravity * particle.mass;
        particle.vx *= 0.9994;
        particle.vy *= 0.9996;
      }

      if (this.config.convectionStrength > 0.01) {
        const particleTemp = speed2ToTemperature(particle.speed2());
        const buoyancy = clamp((particleTemp - currentTemp) / 22, -2.5, 2.5);
        particle.fy -= buoyancy * (7.5 + 14 * this.config.convectionStrength);
        particle.fx += 0.5 * Math.sin((particle.y - bounds.minY) / height * Math.PI * 4) * this.config.convectionStrength * 2;
      }

      if (!drag) continue;
      let dx = particle.x - drag.x;
      let dy = particle.y - drag.y;
      if (this.config.boundaryMode === "periodic") {
        if (dx > width * 0.5) dx -= width;
        if (dx < -width * 0.5) dx += width;
        if (dy > height * 0.5) dy -= height;
        if (dy < -height * 0.5) dy += height;
      }
      const distance = Math.hypot(dx, dy);
      if (distance >= drag.radius) continue;
      const falloff = 1 - distance / drag.radius;
      particle.fx += drag.fx * falloff * 30;
      particle.fy += drag.fy * falloff * 30;
    }
  }

  getPhaseChangeRateScale(state, exchange) {
    const configuredScale = Math.max(1, this.config.phaseChangeRateScale ?? 1);
    if (configuredScale <= 1 || Math.abs(exchange.netPower) < 0.01) {
      return 1;
    }

    const nearFreezing = Math.abs(state.temperature - FREEZING_POINT) < 0.02;
    const nearBoiling = Math.abs(state.temperature - BOILING_POINT) < 0.02;
    const hotDriver =
      this.bulkTargetTemp > BOILING_POINT ||
      this.config.ambientTemp > BOILING_POINT ||
      this.localZones.some((zone) => zone.targetTemperature > BOILING_POINT);
    const coldDriver =
      this.bulkTargetTemp < FREEZING_POINT ||
      this.config.ambientTemp < FREEZING_POINT ||
      this.localZones.some((zone) => zone.targetTemperature < FREEZING_POINT);

    const vaporizing = nearBoiling && state.liquid > 0.02 && exchange.netPower > 0 && hotDriver;
    const condensing = nearBoiling && state.gas > 0.02 && exchange.netPower < 0 && !hotDriver;
    const melting = nearFreezing && state.solid > 0.02 && exchange.netPower > 0 && !coldDriver;
    const freezing = nearFreezing && state.liquid > 0.02 && exchange.netPower < 0 && coldDriver;
    return vaporizing || condensing || melting || freezing ? configuredScale : 1;
  }

  coupleToBulk(particles, stats, dt) {
    this.elapsed += dt;
    this.sampleMassKg = this.computeSampleMassKg(particles);
    const actualTemp = Math.max(0.3, stats.kineticTemperature ?? stats.temperature);
    const currentState = this.enthalpyToState(this.sampleSpecificEnthalpy);
    this.thermalCapacity = this.sampleMassKg * Math.max(1, currentState.effectiveCp);
    const exchange = this.computeHeatExchange(currentState);
    this.syncAtmosphereState(currentState, exchange);
    const phaseChangeRateScale = this.getPhaseChangeRateScale(currentState, exchange);
    const appliedNetPower = exchange.netPower * phaseChangeRateScale;
    this.sampleSpecificEnthalpy += (appliedNetPower * dt) / Math.max(0.001, this.sampleMassKg);
    this.sampleSpecificEnthalpy = clamp(this.sampleSpecificEnthalpy, -200000, 4200000);
    const nextState = this.enthalpyToState(this.sampleSpecificEnthalpy);
    const targetTemp = clamp(nextState.temperature, 0.3, 773.15);

    this.lastHeatFlow = exchange.environmentPower;
    this.lastSourcePower = exchange.sourcePower;
    this.lastNetPower = appliedNetPower;
    this.heatLost += Math.max(0, -exchange.environmentPower) * dt;

    for (let index = this.localZones.length - 1; index >= 0; index -= 1) {
      this.localZones[index].ttl -= dt;
      if (this.localZones[index].ttl <= 0) {
        this.localZones.splice(index, 1);
      }
    }

    for (const particle of particles) {
      let zoneApplied = false;

      for (const zone of this.localZones) {
        const dx = particle.x - zone.x;
        const dy = particle.y - zone.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= zone.radius) continue;

        const weight = 1 - distance / zone.radius;
        const particleTemp = Math.max(0.3, speed2ToTemperature(particle.speed2()));
        const localTarget = clamp(particleTemp + zone.intensity * weight * dt * 0.9, 0.3, 773.15);
        const factor = Math.sqrt(localTarget / particleTemp);
        particle.vx *= factor;
        particle.vy *= factor;

        particle.vx += (Math.random() - 0.5) * 0.08 * weight;
        particle.vy += (Math.random() - 0.5) * 0.08 * weight;

        zoneApplied = true;
      }

      if (zoneApplied) continue;
    }

    const currentTemp = actualTemp;
    const regulatedTarget = clamp(targetTemp, 0.3, 773.15);
    const factor = Math.sqrt(regulatedTarget / currentTemp);
    const phaseLock = clamp(nextState.solid * 0.7 + nextState.liquid * 0.28, 0.16, 0.78);
    const appliedFactor = lerp(1, factor, clamp(0.05 + dt * (2.2 + phaseLock), 0.05, 0.22));
    for (const particle of particles) {
      particle.vx *= appliedFactor;
      particle.vy *= appliedFactor;
    }

    const bulkGapStrength = clamp(Math.abs(regulatedTarget - currentTemp) / 220, 0, 0.12);
    const highTempMixing = clamp((regulatedTarget - 328.15) / 120, 0, 0.16);
    const gasMixing = nextState.gas * 0.14;
    const heatingDrive = clamp(
      ((this.config.ambientTemp - regulatedTarget) / 180) +
      clamp(this.lastNetPower / 220, 0, 1),
      0,
      1
    );
    const relaxationStrength = (this.config.cupPresent ? 0.09 : 0.08) + bulkGapStrength + highTempMixing + gasMixing;
    for (const particle of particles) {
      const localTemp = Math.max(0.3, speed2ToTemperature(particle.speed2()));
      const extremeCorrection =
        regulatedTarget > 338.15 && localTemp < regulatedTarget * 0.68
          ? 0.22
          : regulatedTarget < 268.15 && localTemp > regulatedTarget * 1.4
            ? 0.22
            : 0;
      const mixStrength = clamp(relaxationStrength + nextState.solid * 0.05 + extremeCorrection, 0.08, 0.42);
      const relaxedTemp = lerp(localTemp, regulatedTarget, mixStrength);
      const relaxFactor = Math.sqrt(relaxedTemp / localTemp);
      particle.vx *= relaxFactor;
      particle.vy *= relaxFactor;

      const postRelaxTemp = Math.max(0.3, speed2ToTemperature(particle.speed2()));
      const regulatedDisplayTemp = absoluteToDisplay(regulatedTarget);
      const postRelaxDisplayTemp = absoluteToDisplay(postRelaxTemp);
      if (heatingDrive > 0.15 && regulatedDisplayTemp > 24) {
        const allowedSpreadC = lerp(18, 6, heatingDrive);
        const floorDisplayTemp = regulatedDisplayTemp - allowedSpreadC;
        if (postRelaxDisplayTemp < floorDisplayTemp) {
          const floorAbsoluteTemp = floorDisplayTemp + 273.15;
          const floorFactor = Math.sqrt(floorAbsoluteTemp / postRelaxTemp);
          const floorBlend = clamp(0.12 + heatingDrive * 0.28, 0.12, 0.42);
          particle.vx *= lerp(1, floorFactor, floorBlend);
          particle.vy *= lerp(1, floorFactor, floorBlend);
        }
      }

      const hotStateFactor = clamp((regulatedTarget - 343.15) / 170, 0, 1);
      if (hotStateFactor > 0) {
        const postRelaxTemp = Math.max(0.3, speed2ToTemperature(particle.speed2()));
        const hotFloorFraction = lerp(0.72, 0.84, Math.max(nextState.gas, hotStateFactor));
        const hotFloorTemp = regulatedTarget * hotFloorFraction;
        if (postRelaxTemp < hotFloorTemp) {
          const floorFactor = Math.sqrt(hotFloorTemp / postRelaxTemp);
          const floorBlend = 0.18 + hotStateFactor * 0.24 + nextState.gas * 0.12;
          particle.vx *= lerp(1, floorFactor, clamp(floorBlend, 0.18, 0.5));
          particle.vy *= lerp(1, floorFactor, clamp(floorBlend, 0.18, 0.5));
        }
      }
    }

    let finalAverageTemp = 0;
    for (const particle of particles) {
      finalAverageTemp += Math.max(0.3, speed2ToTemperature(particle.speed2()));
    }
    finalAverageTemp /= Math.max(1, particles.length);
    const finalThermostatFactor = Math.sqrt(regulatedTarget / Math.max(0.3, finalAverageTemp));
    for (const particle of particles) {
      particle.vx *= finalThermostatFactor;
      particle.vy *= finalThermostatFactor;
    }

    this.sampleTemperature = regulatedTarget;
    this.phaseState = nextState;

    this.lastCoolingRate = this.elapsed > 0 ? (this.sampleTemperature - this.initialTemp) / this.elapsed : 0;
    const referenceConductance = 1.8 + this.config.envCoeff * 0.6;
    const referenceLoss = Math.max(0.01, referenceConductance * Math.abs(this.initialTemp - this.config.ambientTemp) * this.elapsed);
    this.insulationScore = clamp(100 * (1 - Math.abs(this.heatLost) / referenceLoss), 0, 100);
  }

  updateAtmosphericWater(bounds, visualBounds, dt) {
    if (!this.config.cupPresent) {
      this.wallDroplets = [];
      this.fallingDroplets = [];
      this.externalWaterMassKg = 0;
      this.wallFilmMassKg = 0;
      this.condensationLevel = 0;
      this.spawnVapor(visualBounds, this.sampleEvaporationRateKgPerS * 50000, dt);
      this.updateFreeParticles(bounds, visualBounds, dt);
      return;
    }

    const geometry = this.getGeometry();
    const wallArea = geometry.sideArea + geometry.bottomArea;
    const wallHeightM = this.config.cupPresent ? 0.09 : 0.06;
    const pxPerMeter = (visualBounds.maxY - visualBounds.minY) / Math.max(0.02, wallHeightM);
    const condensationMass = this.condensationRateKgPerS * dt;
    this.wallFilmMassKg += condensationMass;

    let wallEvaporationMass = this.surfaceEvaporationRateKgPerS * dt;
    if (wallEvaporationMass > 0) {
      const filmLoss = Math.min(this.wallFilmMassKg, wallEvaporationMass);
      this.wallFilmMassKg -= filmLoss;
      wallEvaporationMass -= filmLoss;
    }

    if (wallEvaporationMass > 0 && this.wallDroplets.length) {
      const totalDropletMass = this.wallDroplets.reduce((sum, droplet) => sum + droplet.massKg, 0);
      for (const droplet of this.wallDroplets) {
        const share = wallEvaporationMass * (droplet.massKg / Math.max(1e-12, totalDropletMass));
        droplet.massKg = Math.max(0, droplet.massKg - share);
      }
    }

    const filmThicknessM = this.wallFilmMassKg / Math.max(1e-12, WATER_DENSITY * wallArea);
    const nucleationPatchArea = wallArea / 18;
    const filmReserveThicknessM = 1.5e-7;
    const filmReserveMassKg = filmReserveThicknessM * WATER_DENSITY * nucleationPatchArea;
    const wetAreaScaleMassKg = 1.2e-6;
    const currentWallWaterMassKg = this.wallFilmMassKg + this.wallDroplets.reduce((sum, droplet) => sum + droplet.massKg, 0);
    const maxVisibleDroplets = clamp(Math.round(currentWallWaterMassKg / Math.max(1e-10, filmReserveMassKg * 1.3)), 0, 28);

    if (this.wallDroplets.length < maxVisibleDroplets && this.wallFilmMassKg > filmReserveMassKg * 1.1) {
      const transferMass = Math.min(this.wallFilmMassKg - filmReserveMassKg, 2.2e-7);
      if (transferMass > 0) {
        const side = this.wallDroplets.length % 2 === 0 ? "left" : "right";
        const droplet = this.createWallDroplet(visualBounds, side, 0.10 + Math.random() * 0.72);
        droplet.massKg = transferMass;
        this.wallDroplets.push(droplet);
        this.wallFilmMassKg -= transferMass;
      }
    }

    if (this.wallDroplets.length && this.wallFilmMassKg > filmReserveMassKg) {
      const feedMass = Math.min(this.wallFilmMassKg - filmReserveMassKg, condensationMass * 0.8 + dt * 4e-7);
      if (feedMass > 0) {
        const weights = this.wallDroplets.map((droplet) => Math.max(0.4, this.dropletRadiusPx(droplet.massKg) ** 2));
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
        this.wallDroplets.forEach((droplet, index) => {
          droplet.massKg += feedMass * (weights[index] / Math.max(1e-12, weightSum));
        });
        this.wallFilmMassKg -= feedMass;
      }
    }

    const material = MATERIALS[this.config.material];
    const thetaAdv = material.thetaAdvDeg * Math.PI / 180;
    const thetaRec = material.thetaRecDeg * Math.PI / 180;
    const thetaMean = Math.max(0.12, (thetaAdv + thetaRec) * 0.5);
    const deltaCos = Math.max(0.02, Math.cos(thetaRec) - Math.cos(thetaAdv));
    const gamma = this.waterSurfaceTension(this.cupWallTemperature);
    const kFurmidge = 1.2;
    const waterViscosity = 0.001;

    for (let index = this.wallDroplets.length - 1; index >= 0; index -= 1) {
      const droplet = this.wallDroplets[index];
      const volumeM3 = droplet.massKg / Math.max(1, WATER_DENSITY);
      const baseRadiusM = Math.cbrt(
        Math.max(1e-15, (3 * volumeM3 * Math.pow(Math.sin(thetaMean), 3)) /
          (Math.PI * Math.pow(1 - Math.cos(thetaMean), 2) * (2 + Math.cos(thetaMean))))
      );
      const contactWidthM = Math.max(2e-4, 2 * baseRadiusM);
      const retentionForce = kFurmidge * contactWidthM * gamma * deltaCos;
      const weightForce = droplet.massKg * 9.80665;
      const driveForce = Math.max(0, weightForce - retentionForce);
      const dragForce = 6 * Math.PI * waterViscosity * Math.max(1e-4, baseRadiusM) * droplet.vyMps;
      const acceleration = driveForce > 0 ? Math.max(0, (driveForce - dragForce) / Math.max(1e-9, droplet.massKg)) : 0;

      if (driveForce > 0) {
        droplet.vyMps += acceleration * dt;
      } else {
        droplet.vyMps *= 0.35;
      }

      droplet.y += droplet.vyMps * dt * pxPerMeter;
      droplet.lengthNorm = clamp((droplet.y - visualBounds.minY) / Math.max(1, visualBounds.maxY - visualBounds.minY), 0, 1);
      const radiusPx = this.dropletRadiusPx(droplet.massKg);
      droplet.x = droplet.side === "left" ? visualBounds.minX + 7 + radiusPx * 0.08 : visualBounds.maxX - 7 - radiusPx * 0.08;

      const criticalDetach = driveForce > 0 && droplet.y >= visualBounds.maxY - 14;
      if (criticalDetach) {
        if (this.fallingDroplets.length < 18) {
          this.fallingDroplets.push({
            x: droplet.x,
            y: Math.min(visualBounds.maxY - 14, droplet.y),
            vxMps: (droplet.side === "left" ? -1 : 1) * 0.02 * (0.6 + Math.random() * 0.8),
            vyMps: Math.max(0.08, droplet.vyMps),
            massKg: Math.max(droplet.massKg * 0.9, 1.4e-7),
            ttl: 3.5
          });
        }
        this.wallDroplets.splice(index, 1);
        continue;
      }

      if (droplet.massKg <= 2e-8) {
        this.wallDroplets.splice(index, 1);
      }
    }

    for (let outer = this.wallDroplets.length - 1; outer >= 0; outer -= 1) {
      const a = this.wallDroplets[outer];
      if (!a) continue;
      for (let inner = outer - 1; inner >= 0; inner -= 1) {
        const b = this.wallDroplets[inner];
        if (!b) continue;
        if (a.side !== b.side) continue;
        const distance = Math.abs(a.y - b.y);
        if (distance > this.dropletRadiusPx(a.massKg) + this.dropletRadiusPx(b.massKg)) continue;
        const totalMass = a.massKg + b.massKg;
        const combinedVyMps = (a.vyMps * a.massKg + b.vyMps * b.massKg) / Math.max(1e-9, totalMass);
        a.y = (a.y * a.massKg + b.y * b.massKg) / Math.max(1e-9, totalMass);
        a.vyMps = Math.max(0, combinedVyMps);
        a.massKg = totalMass;
        this.wallDroplets.splice(inner, 1);
      }
    }

    this.spawnVapor(visualBounds, this.sampleEvaporationRateKgPerS * 240000, dt);
    this.updateFreeParticles(bounds, visualBounds, dt);
    this.externalWaterMassKg = this.wallFilmMassKg +
      this.wallDroplets.reduce((sum, droplet) => sum + droplet.massKg, 0) +
      this.fallingDroplets.reduce((sum, droplet) => sum + droplet.massKg, 0);
    this.condensationLevel = clamp(this.externalWaterMassKg / wetAreaScaleMassKg, 0, 1);
  }

  updateFreeParticles(bounds, visualBounds, dt) {
    const wallHeightM = this.config.cupPresent ? 0.09 : 0.06;
    const pxPerMeter = (visualBounds.maxY - visualBounds.minY) / Math.max(0.02, wallHeightM);
    for (let index = this.fallingDroplets.length - 1; index >= 0; index -= 1) {
      const droplet = this.fallingDroplets[index];
      droplet.vyMps += 9.80665 * dt;
      droplet.vxMps *= 0.996;
      droplet.x += droplet.vxMps * dt * pxPerMeter;
      droplet.y += droplet.vyMps * dt * pxPerMeter;
      droplet.ttl -= dt;
      if (droplet.y >= visualBounds.maxY + 2) {
        this.precipitatedMassKg += droplet.massKg;
        this.spawnSplash(droplet.x, visualBounds.maxY + 1, droplet.massKg);
        this.fallingDroplets.splice(index, 1);
        continue;
      }
      if (droplet.ttl <= 0 || droplet.x < bounds.minX - 40 || droplet.x > bounds.maxX + 40) {
        this.fallingDroplets.splice(index, 1);
      }
    }

    for (let index = this.vaporParticles.length - 1; index >= 0; index -= 1) {
      const vapor = this.vaporParticles[index];
      vapor.x += vapor.vx * dt * 10;
      vapor.y += vapor.vy * dt * 10;
      vapor.vx += Math.sin(vapor.y * 0.05 + index) * 0.05;
      vapor.vy -= 2 * dt;
      vapor.ttl -= dt;
      vapor.alpha *= 0.992;
      if (vapor.ttl <= 0 || vapor.alpha <= 0.01 || vapor.y < visualBounds.minY - 70) {
        this.vaporParticles.splice(index, 1);
      }
    }

    for (let index = this.splashParticles.length - 1; index >= 0; index -= 1) {
      const splash = this.splashParticles[index];
      splash.vy += 620 * dt;
      splash.x += splash.vx * dt;
      splash.y += splash.vy * dt;
      splash.ttl -= dt;
      splash.alpha *= 0.96;
      if (splash.ttl <= 0 || splash.alpha <= 0.03) {
        this.splashParticles.splice(index, 1);
      }
    }
  }
}
