import {
  RiceMoundConfig,
  NutritionEstimate,
  RICE_DENSITY,
  RICE_KCAL_PER_100G,
  ERROR_MARGIN,
} from '../types';

export function calculateEllipsoidVolume(config: RiceMoundConfig): number {
  const { radiusX, radiusZ, height } = config;
  // Half-ellipsoid (hemisphere mound): V = (2/3) * π * rx * h * rz
  const volume = (2 / 3) * Math.PI * radiusX * height * radiusZ;
  return volume;
}

export function volumeToMl(volume: number): number {
  return volume * 1000;
}

export function mlToGrams(ml: number, density: number = RICE_DENSITY): number {
  return ml * density;
}

export function gramsToKcal(grams: number, kcalPer100g: number = RICE_KCAL_PER_100G): number {
  return (grams / 100) * kcalPer100g;
}

export function gramsToSendokMakan(grams: number): number {
  return grams / 15;
}

export function gramsToCentong(grams: number): number {
  return grams / 100;
}

export function calculateNutritionEstimate(config: RiceMoundConfig): NutritionEstimate {
  const volume = calculateEllipsoidVolume(config);
  const ml = volumeToMl(volume);
  const grams = mlToGrams(ml);
  const kcal = gramsToKcal(grams);
  
  const gramsLow = grams * (1 - ERROR_MARGIN);
  const gramsHigh = grams * (1 + ERROR_MARGIN);
  const kcalLow = kcal * (1 - ERROR_MARGIN);
  const kcalHigh = kcal * (1 + ERROR_MARGIN);
  
  const sendokMakan = gramsToSendokMakan(grams);
  const centong = gramsToCentong(grams);
  
  return {
    grams: Math.round(grams),
    kcal: Math.round(kcal),
    gramsLow: Math.round(gramsLow),
    gramsHigh: Math.round(gramsHigh),
    kcalLow: Math.round(kcalLow),
    kcalHigh: Math.round(kcalHigh),
    sendokMakan: Math.round(sendokMakan * 10) / 10,
    centong: Math.round(centong * 10) / 10,
  };
}
