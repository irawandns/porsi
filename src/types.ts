export interface RiceMoundConfig {
  radiusX: number;
  radiusZ: number;
  height: number;
}

export interface PlateSize {
  id: string;
  name: string;
  nameBahasa: string;
  scale: number;
}

export interface FoodItem {
  id: string;
  name: string;
  nameBahasa: string;
  kcal: number;
  position: [number, number, number];
  color: string;
  enabled: boolean;
}

export interface NutritionEstimate {
  grams: number;
  kcal: number;
  gramsLow: number;
  gramsHigh: number;
  kcalLow: number;
  kcalHigh: number;
  sendokMakan: number;
  centong: number;
}

export const RICE_DENSITY = 1.15;
export const RICE_KCAL_PER_100G = 130;
export const ERROR_MARGIN = 0.20;

export const PLATE_SIZES: PlateSize[] = [
  { id: 'rumah', name: 'Home Plate', nameBahasa: 'Piring Rumah', scale: 1.0 },
  { id: 'warung', name: 'Warung Plate', nameBahasa: 'Piring Warung', scale: 1.2 },
  { id: 'mangkok', name: 'Bowl', nameBahasa: 'Mangkok', scale: 0.8 },
];

export const INITIAL_FOODS: FoodItem[] = [
  {
    id: 'ayam',
    name: 'Fried Chicken Piece',
    nameBahasa: 'Ayam Goreng',
    kcal: 180,
    position: [1.5, 0.1, 0],
    color: '#d4a574',
    enabled: false,
  },
  {
    id: 'telur',
    name: 'Boiled Egg',
    nameBahasa: 'Telur Rebus',
    kcal: 70,
    position: [-1.5, 0.1, 0],
    color: '#f4e4c1',
    enabled: false,
  },
];
