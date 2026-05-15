export const MATERIALS = {
  // Representative conductivities near room temperature:
  // expanded polystyrene ~0.033 W/m-K (NIST SRM 1453),
  // polypropylene ~0.145 W/m-K (reported range 0.10-0.22 W/m-K),
  // Pyrex glass ~1.16 W/m-K,
  // stainless steel (AISI 446) ~14.1 W/m-K.
  // Contact angles are representative room-temperature water values used
  // for droplet retention calculations; real classroom cups vary with finish.
  Styrofoam: { k: 0.033, color: "#d8f0ff", thetaAdvDeg: 98, thetaRecDeg: 78, emissivity: 0.92 },
  Plastic: { k: 0.145, color: "#c9e4d7", thetaAdvDeg: 97, thetaRecDeg: 74, emissivity: 0.94 },
  Glass: { k: 1.16, color: "#a6cff4", thetaAdvDeg: 42, thetaRecDeg: 18, emissivity: 0.94 },
  Metal: { k: 14.1, color: "#d9d3c1", thetaAdvDeg: 78, thetaRecDeg: 52, emissivity: 0.64 }
};

export const ENVIRONMENTS = {
  Sunny: { ambient: 308.15, coeff: 0.75, solarGain: 14, humidity: 38 },
  Cool: { ambient: 295.15, coeff: 0.9, solarGain: 0, humidity: 55 },
  Cold: { ambient: 275.15, coeff: 1.35, solarGain: -4, humidity: 65 }
};

export const DEFAULTS = {
  particleCount: 320,
  temperature: 315.15,
  epsilon: 1.05,
  sigma: 11,
  dt: 0.012,
  cupThickness: 1.6,
  ambientTemp: 295.15,
  ambientHumidity: 55,
  envCoeff: 0.9,
  material: "Glass",
  environment: "Cool",
  boundaryMode: "reflective",
  trails: false,
  vectors: true,
  overlay: false,
  thermostat: false,
  gravityStrength: 0.8,
  convectionStrength: 0.25,
  cupPresent: false,
  cupPlacement: "center",
  initialIceTemperature: 268.15,
  brushTemperature: 233.15,
  simpleMode: true,
  trailStrength: 0,
  scenarioRunning: false,
  timeScale: 1,
  phaseChangeRateScale: 10,
  temperatureUnit: "F",
  measurementSystem: "imperial",
  energyUnit: "cal"
};

export const TEMP_SCALE = 30;
export const SPECIFIC_HEAT = 4180;
export const PARTICLE_MASS = 1;
export const MAX_HISTORY = 900;
export const DYNAMICS_SPEED = 10;
export const SIMULATION_RATE = 1;

export const WATER_DENSITY = 997;
export const ICE_DENSITY = 917;
export const ICE_SPECIFIC_HEAT = 2108;
export const STEAM_SPECIFIC_HEAT = 1955;
export const LATENT_HEAT_FUSION = 333550;
export const LATENT_HEAT_VAPORIZATION = 2254800;
export const FREEZING_POINT = 273.15;
export const BOILING_POINT = 373.15;
export const LATENT_HEAT_SUBLIMATION = 2834000;
