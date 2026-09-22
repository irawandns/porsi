import { useState, useEffect, useRef, useCallback } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import Palette, { PaletteItem } from './components/Palette';
import ErrorBoundary from './components/ErrorBoundary';
import { PlateSize, PlacedFood, FoodType, PortionSize, PLATE_SIZES, AYAM_KCAL, TELUR_KCAL } from './types';
import { calculateNutritionEstimate, calculateEllipsoidVolume } from './utils/calculations';
import './styles.css';

export interface RaycastHandle {
  raycastPlate: (screenPos: { x: number; y: number }) => { x: number; y: number; z: number } | null;
  raycastFood: (screenPos: { x: number; y: number }) => { food: PlacedFood; part: 'top' | 'body' | 'foot' } | null;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'nasi', name: 'Rice', nameBahasa: 'Nasi', color: '#f8f8f0', icon: '🍚' },
  { id: 'ayam', name: 'Chicken', nameBahasa: 'Ayam', color: '#d4a574', icon: '🍗' },
  { id: 'telur', name: 'Egg', nameBahasa: 'Telur', color: '#f4e4c1', icon: '🥚' },
];

// Palette chips stay reusable: every spawn mints a fresh instanceId so the
// plate can hold several ayam / several telur. Counter + random suffix guards
// against Date.now() collisions on rapid successive taps.
let instanceCounter = 0;
function nextInstanceId(prefix: string): string {
  instanceCounter += 1;
  return `${prefix}-${Date.now()}-${instanceCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---- Tap → size → pour tuning -------------------------------------------
// Nasi Sedang is the long-standing default mound {1.2, 1.0, 0.5} ≈ 200 g,
// inside the 150–250 g target. Kecil/Besar scale VOLUME (uniform linear
// cbrt factor) so the hints stay honest: ~140 / ~200 / ~270 g.
const NASI_BASE = { radiusX: 1.2, radiusZ: 1.0, height: 0.5 };
const NASI_VOL_MULT: Record<PortionSize, number> = { kecil: 0.7, sedang: 1.0, besar: 1.35 };
// Lauk kcal never changes with size (no invented grams); this only scales
// the mesh + collision radius.
const LAUK_SCALE: Record<PortionSize, number> = { kecil: 0.8, sedang: 1.0, besar: 1.25 };

const SIZE_ORDER: PortionSize[] = ['kecil', 'sedang', 'besar'];
const SIZE_LABEL: Record<PortionSize, string> = { kecil: 'Kecil', sedang: 'Sedang', besar: 'Besar' };

function sizeHint(foodType: FoodType, size: PortionSize): string {
  if (foodType === 'nasi') {
    return size === 'kecil' ? '~140g' : size === 'sedang' ? '~200g' : '~270g';
  }
  return size === 'kecil' ? 'kecil' : size === 'sedang' ? 'standar' : 'besar';
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [plateSize, setPlateSize] = useState<PlateSize>(PLATE_SIZES[0]);
  const [placedFoods, setPlacedFoods] = useState<PlacedFood[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  // Chip tapped, waiting for a size choice. Null = size sheet closed.
  const [pendingType, setPendingType] = useState<FoodType | null>(null);
  // Non-null while an already-placed food is being dragged on the plate.
  // Set only on drag start/end — never per-move — so mobile stays
  // setState-storm free.
  const [placedDraggingId, setPlacedDraggingId] = useState<string | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const raycastRef = useRef<RaycastHandle>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.title = `Porsi - v${__BUILD_VERSION__}`;
  }, []);

  const totalKcal = placedFoods.reduce((sum, food) => {
    if (food.foodType === 'nasi' && food.config) {
      const nasiEstimate = calculateNutritionEstimate(food.config);
      return sum + nasiEstimate.kcal;
    } else if (food.foodType === 'ayam') {
      return sum + AYAM_KCAL;
    } else if (food.foodType === 'telur') {
      return sum + TELUR_KCAL;
    }
    return sum;
  }, 0);

  const totalGrams = placedFoods.reduce((sum, food) => {
    if (food.foodType === 'nasi' && food.config) {
      const nasiEstimate = calculateNutritionEstimate(food.config);
      return sum + nasiEstimate.grams;
    }
    return sum;
  }, 0);

  const displayEstimate = placedFoods.length > 0 ? {
    grams: Math.round(totalGrams),
    kcal: Math.round(totalKcal),
    gramsLow: Math.round(totalGrams * 0.8),
    gramsHigh: Math.round(totalGrams * 1.2),
    kcalLow: Math.round(totalKcal * 0.8),
    kcalHigh: Math.round(totalKcal * 1.2),
  } : {
    grams: 0,
    kcal: 0,
    gramsLow: 0,
    gramsHigh: 0,
    kcalLow: 0,
    kcalHigh: 0,
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Get collision radius for a food item
  const getFoodRadius = useCallback((food: PlacedFood): number => {
    if (food.foodType === 'nasi' && food.config) {
      return Math.max(food.config.radiusX, food.config.radiusZ) * 0.95;
    } else if (food.foodType === 'ayam') {
      return 0.35 * (food.sizeScale ?? 1);
    } else if (food.foodType === 'telur') {
      return 0.30 * (food.sizeScale ?? 1);
    }
    return 0.3;
  }, []);

  // Check if two foods overlap in XZ plane
  const checkOverlap = useCallback((food1: PlacedFood, food2: PlacedFood): boolean => {
    const r1 = getFoodRadius(food1);
    const r2 = getFoodRadius(food2);
    const dx = food1.position[0] - food2.position[0];
    const dz = food1.position[2] - food2.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist < (r1 + r2 + 0.05);
  }, [getFoodRadius]);

  // Merge two nasi mounds into one
  const mergeNasi = useCallback((nasi1: PlacedFood, nasi2: PlacedFood): PlacedFood => {
    if (!nasi1.config || !nasi2.config) return nasi1;

    const vol1 = calculateEllipsoidVolume(nasi1.config);
    const vol2 = calculateEllipsoidVolume(nasi2.config);
    const totalVolume = vol1 + vol2;

    // Determine larger mound (kept mound)
    const isNasi1Larger = vol1 >= vol2;
    const keptNasi = isNasi1Larger ? nasi1 : nasi2;
    const keptVol = isNasi1Larger ? vol1 : vol2;
    const otherVol = isNasi1Larger ? vol2 : vol1;

    // Position: prefer kept position, or weighted midpoint if within ~20% size
    const volumeRatio = Math.min(keptVol, otherVol) / Math.max(keptVol, otherVol);
    let x: number, z: number;
    if (volumeRatio >= 0.8) {
      // Within ~20% - use weighted midpoint
      x = (nasi1.position[0] * vol1 + nasi2.position[0] * vol2) / totalVolume;
      z = (nasi1.position[2] * vol1 + nasi2.position[2] * vol2) / totalVolume;
    } else {
      // Larger dominates - use kept position
      x = keptNasi.position[0];
      z = keptNasi.position[2];
    }

    // Preserve aspect of kept mound, scale uniformly for combined volume
    // V_new = V_kept + V_other = (2/3) * π * (rx * scale) * (h * scale) * (rz * scale)
    // V_new = (2/3) * π * rx * h * rz * scale³
    // scale³ = V_new / V_kept
    // scale = (V_new / V_kept)^(1/3)
    const scaleFactor = Math.pow(totalVolume / keptVol, 1 / 3);

    // keptNasi.config guaranteed non-null by early return
    const keptConfig = keptNasi.config!;
    const newConfig = {
      radiusX: keptConfig.radiusX * scaleFactor,
      radiusZ: keptConfig.radiusZ * scaleFactor,
      height: keptConfig.height * scaleFactor
    };

    return {
      instanceId: nextInstanceId('nasi'),
      foodType: 'nasi',
      position: [x, 0, z],
      config: newConfig
    };
  }, []);

  // Apply nasi-nasi merge and soft no-overlap for non-nasi pairs
  const resolveCollisions = useCallback((
    newFood: PlacedFood,
    existingFoods: PlacedFood[],
    plateRadius: number
  ): { food: PlacedFood; mergedWith: string[] } => {
    let resultFood = { ...newFood };
    const mergedIds: string[] = [];

    // Check for nasi-nasi merges
    if (resultFood.foodType === 'nasi') {
      for (const other of existingFoods) {
        if (other.foodType === 'nasi' && !mergedIds.includes(other.instanceId)) {
          if (checkOverlap(resultFood, other)) {
            resultFood = mergeNasi(resultFood, other);
            mergedIds.push(other.instanceId);
          }
        }
      }
    }

    // Soft no-overlap for non-nasi-nasi pairs (nasi↔lauk, lauk↔lauk)
    const movingRadius = getFoodRadius(resultFood);
    let x = resultFood.position[0];
    let z = resultFood.position[2];
    const epsilon = 0.05;

    const maxPasses = 5;
    for (let pass = 0; pass < maxPasses; pass++) {
      let anyOverlap = false;

      for (const other of existingFoods) {
        if (mergedIds.includes(other.instanceId)) continue;

        // Skip if both are nasi (already merged above)
        if (resultFood.foodType === 'nasi' && other.foodType === 'nasi') continue;

        const otherRadius = getFoodRadius(other);
        const dx = x - other.position[0];
        const dz = z - other.position[2];
        let dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = movingRadius + otherRadius + epsilon;

        if (dist < minDist) {
          anyOverlap = true;

          if (dist < 0.001) {
            const angle = Math.random() * Math.PI * 2;
            const jitterDist = minDist * 0.5;
            x += Math.cos(angle) * jitterDist;
            z += Math.sin(angle) * jitterDist;
            continue;
          }

          const pushDist = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          x += nx * pushDist;
          z += nz * pushDist;
        }
      }

      if (!anyOverlap) break;
    }

    // Clamp to plate
    const plateDist = Math.sqrt(x * x + z * z);
    const maxDist = plateRadius * 0.9;
    if (plateDist > maxDist) {
      const scale = maxDist / plateDist;
      x *= scale;
      z *= scale;
    }

    resultFood.position = [x, resultFood.position[1], z];

    return { food: resultFood, mergedWith: mergedIds };
  }, [getFoodRadius, checkOverlap, mergeNasi]);

  const handleChipTap = useCallback((itemId: string) => {
    const foodType = itemId as FoodType;
    // Tapping the open chip again dismisses the sheet without placing.
    setPendingType(prev => (prev === foodType ? null : foodType));
  }, []);

  // Tapping a size IMMEDIATELY spawns that food with a pour (no Confirm).
  const handleSizePick = useCallback((size: PortionSize) => {
    const foodType = pendingType;
    if (!foodType) return;

    const plateRadius = plateSize.scale * 2;
    const now = Date.now();
    let newFood: PlacedFood;

    if (foodType === 'nasi') {
      const s = Math.cbrt(NASI_VOL_MULT[size]);
      newFood = {
        instanceId: nextInstanceId('nasi'),
        foodType,
        // Nasi always lands plate center; merge/soft-push resolve the rest.
        position: [0, 0, 0],
        config: {
          radiusX: NASI_BASE.radiusX * s,
          radiusZ: NASI_BASE.radiusZ * s,
          height: NASI_BASE.height * s,
        },
        spawnedAt: now,
      };
    } else {
      const y = 0.15;
      let x = 0;
      let z = 0;
      if (placedFoods.length > 0) {
        // Ring slot around the mound: golden-angle spread over existing
        // lauk count so repeated taps orbit instead of stacking.
        const laukCount = placedFoods.filter(f => f.foodType !== 'nasi').length;
        const anchor = placedFoods.find(f => f.foodType === 'nasi');
        const cx = anchor ? anchor.position[0] : 0;
        const cz = anchor ? anchor.position[2] : 0;
        const anchorR = anchor?.config
          ? Math.max(anchor.config.radiusX, anchor.config.radiusZ)
          : 0.6;
        const ringR = Math.min(anchorR + 0.7, plateRadius * 0.9 - 0.35);
        const angle = laukCount * 2.39996 + Math.random() * 0.3;
        x = cx + Math.cos(angle) * ringR;
        z = cz + Math.sin(angle) * ringR;
      }
      newFood = {
        instanceId: nextInstanceId(foodType),
        foodType,
        position: [x, y, z],
        sizeScale: LAUK_SCALE[size],
        spawnedAt: now,
      };
    }

    const { food: resolvedFood, mergedWith } = resolveCollisions(newFood, placedFoods, plateRadius);
    const filtered = placedFoods.filter(f => !mergedWith.includes(f.instanceId));
    setPlacedFoods([...filtered, resolvedFood]);
    // Auto-select the poured food so sculpt + Buang are one tap away.
    setSelectedFoodId(resolvedFood.instanceId);
    setPendingType(null);
  }, [pendingType, placedFoods, plateSize.scale, resolveCollisions]);

  const handleFoodUpdate = useCallback((instanceId: string, updates: Partial<PlacedFood>) => {
    setPlacedFoods(prev => {
      // Apply the update first
      const updatedFoods = prev.map(food =>
        food.instanceId === instanceId ? { ...food, ...updates } : food
      );

      // Only check collisions if position changed (body drag)
      if (updates.position) {
        const movingFood = updatedFoods.find(f => f.instanceId === instanceId);
        if (movingFood) {
          const others = updatedFoods.filter(f => f.instanceId !== instanceId);
          const { food: resolvedFood, mergedWith } = resolveCollisions(movingFood, others, plateSize.scale * 2);

          if (mergedWith.length > 0) {
            // Merge occurred - remove merged foods and add result
            const filtered = updatedFoods.filter(f => f.instanceId !== instanceId && !mergedWith.includes(f.instanceId));
            setSelectedFoodId(resolvedFood.instanceId);
            return [...filtered, resolvedFood];
          } else {
            // No merge, just position adjustment
            return updatedFoods.map(food =>
              food.instanceId === instanceId
                ? { ...food, position: resolvedFood.position }
                : food
            );
          }
        }
      }

      // Config-only or other updates: apply without collision check
      return updatedFoods;
    });
  }, [resolveCollisions, plateSize.scale]);

  const handleRemoveFood = useCallback((instanceId: string) => {
    setPlacedFoods(prev => prev.filter(food => food.instanceId !== instanceId));
    setSelectedFoodId(prev => (prev === instanceId ? null : prev));
    setPlacedDraggingId(prev => (prev === instanceId ? null : prev));
  }, []);

  // Called by Plate3D only on placed-drag start/end (never per-move).
  const handlePlacedDragStateChange = useCallback((dragging: boolean, instanceId: string | null) => {
    setPlacedDraggingId(dragging ? instanceId : null);
  }, []);

  const selectedFood = selectedFoodId
    ? placedFoods.find(food => food.instanceId === selectedFoodId) ?? null
    : null;

  // Per-instance dock line: nasi reports grams + kcal from the shared volume
  // math; lauk are fixed-kcal pieces with no invented grams (em dash).
  const selectedLine = (() => {
    if (!selectedFood) return null;
    if (selectedFood.foodType === 'nasi' && selectedFood.config) {
      const est = calculateNutritionEstimate(selectedFood.config);
      return { name: 'Nasi', detail: `${est.grams} g · ${est.kcal} kkal` };
    }
    if (selectedFood.foodType === 'ayam') {
      return { name: 'Ayam', detail: `— · ${AYAM_KCAL} kkal` };
    }
    if (selectedFood.foodType === 'telur') {
      return { name: 'Telur', detail: `— · ${TELUR_KCAL} kkal` };
    }
    return null;
  })();

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>🍚 Porsi</h1>
          <div className="subtitle">Estimasi Kalori Visual untuk Indonesia</div>
        </div>
        <div className="header-actions">
          <span className="build-version" id="build-id" title={`Built: ${__BUILD_TIME__}`}>
            v{__BUILD_VERSION__} · {new Date(__BUILD_TIME__).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️ Terang' : '🌙 Gelap'}
          </button>
        </div>
      </header>

      <main className="main-content">
        <Palette
          items={PALETTE_ITEMS}
          selectedId={pendingType}
          onSelect={handleChipTap}
        />

        <div className="canvas-section">
          <ErrorBoundary>
            <div className="canvas-container">
              <Plate3D
                ref={raycastRef}
                plateScale={plateSize.scale}
                theme={theme}
                placedFoods={placedFoods}
                selectedFoodId={selectedFoodId}
                onSelectFood={setSelectedFoodId}
                onFoodUpdate={handleFoodUpdate}
                onFoodRemove={handleRemoveFood}
                onPlacedDragStateChange={handlePlacedDragStateChange}
                trashZoneRef={trashZoneRef}
              />
              <div
                id="trash-zone"
                ref={trashZoneRef}
                className={`trash-zone ${placedDraggingId ? 'visible' : ''}`}
                aria-hidden="true"
              >
                <span className="trash-zone-icon">🗑️</span>
                <span className="trash-zone-label">Seret ke sini untuk buang</span>
              </div>
            </div>
          </ErrorBoundary>

          <div className="metrics-dock">
            <div className="metrics-totals">
              <div className="metric-primary">
                <span className="metric-value">{displayEstimate.grams}</span>
                <span className="metric-unit">g</span>
              </div>
              <div className="metric-secondary">
                <span className="metric-label">kalori:</span>
                <span className="metric-value">{displayEstimate.kcal}</span>
              </div>
              <div className="metric-range">
                <span className="range-band">{displayEstimate.gramsLow}–{displayEstimate.gramsHigh}g</span>
                <span className="range-label">(±20%)</span>
              </div>
            </div>
            {selectedFood && selectedLine && (
              <div className="selection-line">
                <span className="selection-text">
                  Dipilih: <strong>{selectedLine.name}</strong> · {selectedLine.detail}
                </span>
                <button
                  type="button"
                  className="buang-btn"
                  onClick={() => handleRemoveFood(selectedFood.instanceId)}
                >
                  🗑️ Buang
                </button>
              </div>
            )}
          </div>
        </div>

        <ControlPanel
          plateSize={plateSize}
          onPlateSizeChange={setPlateSize}
        />
      </main>

      {/* Minimal size sheet (PoC wiring only — no visual redesign).
          Docks above the tray; tapping a size pours immediately.
          Backdrop / Batal / re-tapping the chip dismisses without placing. */}
      {pendingType && (
        <div className="size-sheet-backdrop" onClick={() => setPendingType(null)}>
          <div
            className="size-sheet"
            role="dialog"
            aria-label={`Pilih porsi ${pendingType}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="size-sheet-title">Pilih porsi</div>
            <div className="size-sheet-row">
              {SIZE_ORDER.map(size => (
                <button
                  key={size}
                  type="button"
                  className="size-btn"
                  onClick={() => handleSizePick(size)}
                >
                  <span className="size-btn-label">{SIZE_LABEL[size]}</span>
                  <span className="size-btn-hint">{sizeHint(pendingType, size)}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="size-cancel"
              onClick={() => setPendingType(null)}
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
