import { PortionSize, RiceMoundConfig } from '../types';

// Single source of truth for portion → mesh size mapping.
// Nasi Sedang is the long-standing default mound {1.2, 1.0, 0.5} ≈ 200 g,
// inside the 150–250 g target. Kecil/Besar scale VOLUME (uniform linear
// cbrt factor) so the hints stay honest: ~140 / ~200 / ~270 g.
// Lauk kcal never changes with size (no invented grams); this only scales
// the mesh + collision radius.
export const NASI_BASE = { radiusX: 1.2, radiusZ: 1.0, height: 0.5 };
export const NASI_VOL_MULT: Record<PortionSize, number> = {
  kecil: 0.7,
  sedang: 1.0,
  besar: 1.35,
};
export const LAUK_SCALE: Record<PortionSize, number> = {
  kecil: 0.8,
  sedang: 1.0,
  besar: 1.25,
};

export function nasiConfigFor(size: PortionSize): RiceMoundConfig {
  const s = Math.cbrt(NASI_VOL_MULT[size]);
  return {
    radiusX: NASI_BASE.radiusX * s,
    radiusZ: NASI_BASE.radiusZ * s,
    height: NASI_BASE.height * s,
  };
}

export function laukScaleFor(size: PortionSize): number {
  return LAUK_SCALE[size];
}

/** Collision footprint radius for a food item (matches visual footprint). */
export function foodRadius(
  foodType: 'nasi' | 'ayam' | 'telur',
  config: RiceMoundConfig | undefined,
  sizeScale: number | undefined,
): number {
  if (foodType === 'nasi' && config) {
    return Math.max(config.radiusX, config.radiusZ) * 0.95;
  } else if (foodType === 'ayam') {
    return 0.35 * (sizeScale ?? 1);
  } else if (foodType === 'telur') {
    return 0.3 * (sizeScale ?? 1);
  }
  return 0.3;
}
