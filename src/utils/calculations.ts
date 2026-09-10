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
  // Scene units calibrated so default {1.2, 1.0, 0.5} → ~150-250g
  // Scene volume is in abstract units; scale factor converts to ml
  // 1 scene unit³ ≈ 0.138 dm³ = 138 ml (calibrated for realistic portions)
  return volume * 138;
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

// Fit ellipsoid dimensions to match target volume
// Prefers growing footprint + modest height over tall towers
export function fitEllipsoidToVolume(targetVolume: number): RiceMoundConfig {
  // Target: V = (2/3) * π * rx * h * rz = targetVolume
  // Strategy: prefer wider footprint (rx, rz) over height
  // Start with aspect ratio similar to default (rx:rz ≈ 1.2:1.0)
  // Keep height modest (h ≤ 1.5 * max(rx, rz))
  
  const aspectRatio = 1.2; // rx / rz
  const heightRatio = 0.6; // h / max(rx, rz) for normal mounds
  
  // Solve for rz: V = (2/3) * π * aspectRatio * rz * heightRatio * rz * rz
  // V = (2/3) * π * aspectRatio * heightRatio * rz^3
  const coefficient = (2 / 3) * Math.PI * aspectRatio * heightRatio;
  const rz = Math.pow(targetVolume / coefficient, 1 / 3);
  const rx = rz * aspectRatio;
  const height = Math.max(rx, rz) * heightRatio;
  
  // Clamp to reasonable bounds
  const radiusX = Math.max(0.5, Math.min(3.0, rx));
  const radiusZ = Math.max(0.5, Math.min(3.0, rz));
  const finalHeight = Math.max(0.3, Math.min(2.0, height));
  
  return { radiusX, radiusZ, height: finalHeight };
}
