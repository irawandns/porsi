import { FoodType, PlacedFood, PortionSize, RiceMoundConfig } from '../types';

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

// ---- Toy stacking --------------------------------------------------------
// Releasing over another food lands ON TOP of it and stays stacked, like a
// toy kitchen pile. Nasi still never merges: each scoop stays its own
// object, calories add per piece — stacking only sets resting heights.
export const PLATE_TOP_Y = 0.05;
export const NASI_REST_Y = 0.05;
export const LAUK_REST_LIFT = 0.1;
export const STACK_SINK = 0.04;

/** Base world-Y of a piece: mound base for nasi, mesh center for lauk. */
export function baseYOf(food: PlacedFood): number {
  if (food.foodType === 'nasi') return NASI_REST_Y + (food.position[1] ?? 0);
  return food.position[1];
}

/** World-Y of the top surface of `other` at point (x, z), or -Infinity
 *  when the point falls outside its footprint. */
export function topSurfaceAt(other: PlacedFood, x: number, z: number): number {
  const dx = x - other.position[0];
  const dz = z - other.position[2];
  if (other.foodType === 'nasi' && other.config) {
    const base = NASI_REST_Y + (other.position[1] ?? 0);
    const t =
      (dx * dx) / (other.config.radiusX * other.config.radiusX) +
      (dz * dz) / (other.config.radiusZ * other.config.radiusZ);
    if (t >= 1) return -Infinity;
    return base + other.config.height * Math.sqrt(1 - t);
  }
  if (other.foodType === 'ayam') {
    const s = other.sizeScale ?? 1;
    if (Math.sqrt(dx * dx + dz * dz) >= 0.35 * s) return -Infinity;
    return other.position[1] + 0.15 * s;
  }
  if (other.foodType === 'telur') {
    const r = 0.3 * (other.sizeScale ?? 1);
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= r) return -Infinity;
    return other.position[1] + Math.sqrt(r * r - dist * dist);
  }
  return -Infinity;
}

/** Highest support surface under (x, z): the plate top or the tallest piece
 *  top beneath that point. */
export function supportHeightAt(x: number, z: number, others: PlacedFood[]): number {
  let support = PLATE_TOP_Y;
  for (const other of others) {
    const top = topSurfaceAt(other, x, z);
    if (top > support) support = top;
  }
  return support;
}

/** position[1] value for a piece resting on a support surface at world-Y
 *  `support`. Nasi stores base-minus-NASI_REST_Y (render adds it back);
 *  lauk centers float LAUK_REST_LIFT above the surface. */
export function restYOnSupport(foodType: FoodType, support: number): number {
  if (foodType === 'nasi') return support - NASI_REST_Y;
  return support + LAUK_REST_LIFT;
}
