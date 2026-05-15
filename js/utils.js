import { DYNAMICS_SPEED, TEMP_SCALE } from "./config.js";
export const ABSOLUTE_ZERO_C = -273.15;
export const ABSOLUTE_ZERO_F = -459.67;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const fmt = (value, digits = 2) => Number(value).toFixed(digits);

export const temperatureToSpeed = (temperature) =>
  Math.sqrt(Math.max(0.3, temperature) / TEMP_SCALE) * DYNAMICS_SPEED;

export const speed2ToTemperature = (speed2) =>
  (speed2 / (DYNAMICS_SPEED * DYNAMICS_SPEED)) * TEMP_SCALE;

export const speedToNormalized = (speed) => speed / DYNAMICS_SPEED;

export const absoluteToDisplay = (absoluteTemp) => absoluteTemp + ABSOLUTE_ZERO_C;

export const displayToAbsolute = (displayTemp) => Math.max(0.3, displayTemp - ABSOLUTE_ZERO_C);

export const temperatureUnitSymbol = (unit) => (unit === "F" ? "F" : unit === "K" ? "K" : "C");

export const toDisplayTemperature = (absoluteTemp, unit = "C") => {
  if (unit === "K") return Math.max(0, absoluteTemp);
  const celsius = absoluteToDisplay(absoluteTemp);
  if (unit === "F") return celsius * 9 / 5 + 32;
  return celsius;
};

export const fromDisplayTemperature = (displayTemp, unit = "C") => {
  if (unit === "K") return Math.max(0.3, displayTemp);
  if (unit === "F") return Math.max(0.3, ((displayTemp - 32) * 5 / 9) - ABSOLUTE_ZERO_C);
  return displayToAbsolute(displayTemp);
};

export const formatTemperature = (absoluteTemp, unit = "C", digits = 1) =>
  `${fmt(toDisplayTemperature(absoluteTemp, unit), digits)} ${temperatureUnitSymbol(unit)}`;

export const convertTemperatureDelta = (deltaKelvin, unit = "C") =>
  unit === "F" ? deltaKelvin * 9 / 5 : deltaKelvin;

export const formatTemperatureDelta = (deltaKelvin, unit = "C", digits = 1) =>
  `${fmt(convertTemperatureDelta(deltaKelvin, unit), digits)} ${temperatureUnitSymbol(unit)}`;

export const getTemperatureSliderRange = (unit = "C") => {
  if (unit === "F") {
    return { min: -460, max: 932, step: 1 };
  }
  if (unit === "K") {
    return { min: 0, max: 773, step: 1 };
  }
  return { min: -273, max: 500, step: 1 };
};

export const convertLengthMm = (millimeters, system = "metric") =>
  system === "imperial" ? millimeters / 25.4 : millimeters;

export const formatLength = (millimeters, system = "metric", digits = 1) =>
  system === "imperial"
    ? `${fmt(convertLengthMm(millimeters, system), digits)} in`
    : `${fmt(millimeters, digits)} mm`;

export const convertEnergy = (joules, unit = "J") =>
  unit === "cal" ? joules / 4.184 : joules;

export const energyUnitLabel = (unit = "J") => (unit === "cal" ? "cal" : "J");

export const formatEnergy = (joules, unit = "J", digits = 1) =>
  `${fmt(convertEnergy(joules, unit), digits)} ${energyUnitLabel(unit)}`;

export const formatHeatFlow = (watts, unit = "J", digits = 1) =>
  `${fmt(convertEnergy(watts, unit), digits)} ${energyUnitLabel(unit)}/s`;

export const formatElapsedTime = (seconds) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};
