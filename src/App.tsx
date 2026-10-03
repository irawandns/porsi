import { useState, useEffect, useRef, useCallback } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import Palette, { PaletteItem } from './components/Palette';
import ErrorBoundary from './components/ErrorBoundary';
import { PlateSize, PlacedFood, FoodType, PortionSize, PLATE_SIZES, AYAM_KCAL, TELUR_KCAL } from './types';
import { calculateNutritionEstimate } from './utils/calculations';
import { nasiConfigFor, laukScaleFor, foodRadius } from './utils/sizes';
import './styles.css';

export interface RaycastHandle {
  raycastPlate: (screenPos: { x: number; y: number }) => { x: number; y: number; z: number } | null;
  raycastFood: (screenPos: { x: number; y: number }) => { food: PlacedFood; part: 'top' | 'body' | 'foot' } | null;
}

export interface TrayDrag {
  foodType: FoodType;
  size: PortionSize;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'nasi', name: 'Rice', nameBahasa: 'Nasi', color: '#f8f8f0', icon: '🍚' },
  { id: 'ayam', name: 'Chicken', nameBahasa: 'Ayam', color: '#d4a574', icon: '🍗' },
  { id: 'telur', name: 'Egg', nameBahasa: 'Telur', color: '#f4e4c1', icon: '🥚' },
];

// Palette chips stay reusable: every placement mints a fresh instanceId so
// the plate can hold several nasi / ayam / telur. Counter + random suffix
// guards against Date.now() collisions on rapid successive drops.
let instanceCounter = 0;
function nextInstanceId(prefix: string): string {
  instanceCounter += 1;
  return `${prefix}-${Date.now()}-${instanceCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const SIZE_ORDER: PortionSize[] = ['kecil', 'sedang', 'besar'];
const SIZE_LABEL: Record<PortionSize, string> = { kecil: 'Kecil', sedang: 'Sedang', besar: 'Besar' };
const SIZE_DRAG_THRESHOLD_PX = 10;

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
  // Non-null while a tray drag is airborne. Set only on lift-off / release —
  // never per-move — so mobile stays setState-storm free. The finger position
  // itself lives in trayScreenRef, read by Plate3D's useFrame.
  const [trayDrag, setTrayDrag] = useState<TrayDrag | null>(null);
  // Non-null while an already-placed food is being dragged on the plate.
  // Set only on drag start/end — never per-move.
  const [placedDraggingId, setPlacedDraggingId] = useState<string | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const raycastRef = useRef<RaycastHandle>(null);
  const trayScreenRef = useRef<{ x: number; y: number } | null>(null);
  // HTML ghost for size-sheet drags (the palette owns its own ghost).
  const sizeGhostRef = useRef<HTMLDivElement | null>(null);
  const sizeSessionRef = useRef<{
    size: PortionSize;
    startX: number;
    startY: number;
    dragging: boolean;
    btnRect: DOMRect | null;
  } | null>(null);
  const [sizeDragging, setSizeDragging] = useState<PortionSize | null>(null);
  const trayDragRef = useRef<TrayDrag | null>(null);
  useEffect(() => {
    trayDragRef.current = trayDrag;
  }, [trayDrag]);
  // Fresh-array mirror so rapid successive drops sequence losslessly.
  // resolveCollisions is pure (no id minting), so it can run anywhere.
  const placedFoodsRef = useRef(placedFoods);
  useEffect(() => {
    placedFoodsRef.current = placedFoods;
  }, [placedFoods]);

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

  // Soft no-overlap for EVERY pair — nasi↔nasi included. Nasi never merges:
  // each scoop stays its own 3D object, calories add per piece. The moving
  // food is pushed out of overlap iteratively, then clamped to the plate.
  const resolveCollisions = useCallback((
    newFood: PlacedFood,
    existingFoods: PlacedFood[],
    plateRadius: number
  ): PlacedFood => {
    const movingRadius = foodRadius(newFood.foodType, newFood.config, newFood.sizeScale);
    let x = newFood.position[0];
    let z = newFood.position[2];
    const epsilon = 0.05;

    const maxPasses = 5;
    for (let pass = 0; pass < maxPasses; pass++) {
      let anyOverlap = false;

      for (const other of existingFoods) {
        const otherRadius = foodRadius(other.foodType, other.config, other.sizeScale);
        const dx = x - other.position[0];
        const dz = z - other.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
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

    return { ...newFood, position: [x, newFood.position[1], z] };
  }, []);

  // Place one piece at an explicit plate XZ (tray drop or rearrange commit).
  const addFoodAt = useCallback((foodType: FoodType, size: PortionSize, x: number, z: number) => {
    const basis = placedFoodsRef.current;
    const plateRadius = plateSize.scale * 2;
    const now = Date.now();
    let draft: PlacedFood;

    if (foodType === 'nasi') {
      draft = {
        instanceId: nextInstanceId('nasi'),
        foodType,
        position: [x, 0, z],
        config: nasiConfigFor(size),
        portionSize: size,
        spawnedAt: now,
      };
    } else {
      draft = {
        instanceId: nextInstanceId(foodType),
        foodType,
        position: [x, 0.15, z],
        sizeScale: laukScaleFor(size),
        portionSize: size,
        spawnedAt: now,
      };
    }

    const resolved = resolveCollisions(draft, basis, plateRadius);
    const next = [...basis, resolved];
    placedFoodsRef.current = next;
    setPlacedFoods(next);
    setSelectedFoodId(resolved.instanceId);
    return resolved;
  }, [plateSize.scale, resolveCollisions]);

  // Free-spot finder for tap-to-place: nasi aims center, lauk orbit the
  // mound on a golden-angle ring. Collisions still soft-push the result.
  const placeAtAutoSpot = useCallback((foodType: FoodType, size: PortionSize) => {
    const basis = placedFoodsRef.current;
    const plateRadius = plateSize.scale * 2;
    if (foodType === 'nasi') {
      return addFoodAt(foodType, size, 0, 0);
    }
    let x = 0;
    let z = 0;
    if (basis.length > 0) {
      const laukCount = basis.filter(f => f.foodType !== 'nasi').length;
      const anchor = basis.find(f => f.foodType === 'nasi');
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
    return addFoodAt(foodType, size, x, z);
  }, [addFoodAt, plateSize.scale]);

  // ---- Tray drag (chip + size-sheet sources share one airborne slot) ----
  const handleTrayDragStart = useCallback((foodType: FoodType, size: PortionSize) => {
    // Mirror synchronously: a fast lift-move-release can fit inside one
    // frame, before the effect below would publish the ref.
    trayDragRef.current = { foodType, size };
    setTrayDrag({ foodType, size });
  }, []);

  // Authoritative drop: raycast the release point, place on hit, snap back
  // (return false) on miss. Never places food in empty space.
  const handleTrayDragEnd = useCallback((screenPos: { x: number; y: number }): boolean => {
    const drag = trayDragRef.current;
    trayDragRef.current = null;
    setTrayDrag(null);
    if (!drag) return false;
    if (screenPos.x < 0 || screenPos.y < 0) return false;
    const hit = raycastRef.current?.raycastPlate(screenPos) ?? null;
    if (!hit) return false;
    addFoodAt(drag.foodType, drag.size, hit.x, hit.z);
    return true;
  }, [addFoodAt]);

  const handleChipTap = useCallback((itemId: string) => {
    const foodType = itemId as FoodType;
    // Tapping the open chip again dismisses the sheet without placing.
    setPendingType(prev => (prev === foodType ? null : foodType));
  }, []);

  // Tapping a size places it at a free spot with the same short drop +
  // squash as a drag release — never a pour-from-nowhere.
  const handleSizeTap = useCallback((size: PortionSize) => {
    const foodType = pendingType;
    if (!foodType) return;
    placeAtAutoSpot(foodType, size);
    setPendingType(null);
  }, [pendingType, placeAtAutoSpot]);

  // Size-sheet buttons double as drag sources for that exact size.
  const moveSizeGhost = useCallback((x: number, y: number) => {
    const el = sizeGhostRef.current;
    if (el) {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -70%) scale(1.12)`;
    }
  }, []);

  const handleSizePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, _size: PortionSize) => {
    sizeSessionRef.current = {
      size: _size,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      btnRect: e.currentTarget.getBoundingClientRect(),
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // best-effort on mobile Safari
    }
  }, []);

  const handleSizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>, size: PortionSize, foodType: FoodType) => {
    const s = sizeSessionRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.dragging && Math.hypot(dx, dy) < SIZE_DRAG_THRESHOLD_PX) return;
    if (!s.dragging) {
      s.dragging = true;
      setSizeDragging(size);
      trayScreenRef.current = { x: e.clientX, y: e.clientY };
      handleTrayDragStart(foodType, size);
      requestAnimationFrame(() => moveSizeGhost(e.clientX, e.clientY));
    } else {
      trayScreenRef.current = { x: e.clientX, y: e.clientY };
      moveSizeGhost(e.clientX, e.clientY);
    }
  }, [handleTrayDragStart, moveSizeGhost]);

  const handleSizePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>, size: PortionSize) => {
    const s = sizeSessionRef.current;
    sizeSessionRef.current = null;
    if (!s) return;
    if (!s.dragging) {
      handleSizeTap(size);
      return;
    }
    const dropPos = { x: e.clientX, y: e.clientY };
    trayScreenRef.current = null;
    const placed = handleTrayDragEnd(dropPos);
    if (placed) {
      setSizeDragging(null);
      setPendingType(null);
    } else {
      // Snap the ghost back to the size button.
      const el = sizeGhostRef.current;
      if (el && s.btnRect) {
        el.style.transition = 'transform 180ms ease-out';
        const cx = s.btnRect.left + s.btnRect.width / 2;
        const cy = s.btnRect.top + s.btnRect.height / 2;
        el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -70%) scale(1)`;
      }
      window.setTimeout(() => setSizeDragging(null), 190);
    }
  }, [handleSizeTap, handleTrayDragEnd]);

  const handleFoodUpdate = useCallback((instanceId: string, updates: Partial<PlacedFood>) => {
    setPlacedFoods(prev => {
      const updatedFoods = prev.map(food =>
        food.instanceId === instanceId ? { ...food, ...updates } : food
      );

      // Only position changes need the soft-push pass (rearrange drags).
      if (updates.position) {
        const movingFood = updatedFoods.find(f => f.instanceId === instanceId);
        if (movingFood) {
          const others = updatedFoods.filter(f => f.instanceId !== instanceId);
          const resolved = resolveCollisions(movingFood, others, plateSize.scale * 2);
          return updatedFoods.map(food =>
            food.instanceId === instanceId
              ? { ...food, position: resolved.position }
              : food
          );
        }
      }

      // Config-only or other updates: apply without collision check
      return updatedFoods;
    });
  }, [resolveCollisions, plateSize.scale]);

  // Dock resize: swap the selected piece to a canonical portion. Honest by
  // construction — nasi grams come from the shared volume math, lauk kcal
  // never changes with size. A resize that now overlaps soft-pushes apart.
  const handleResizeSelected = useCallback((size: PortionSize) => {
    const id = selectedFoodId;
    if (!id) return;
    setPlacedFoods(prev => {
      const target = prev.find(f => f.instanceId === id);
      if (!target) return prev;
      let draft: PlacedFood;
      if (target.foodType === 'nasi') {
        draft = { ...target, config: nasiConfigFor(size), portionSize: size };
      } else {
        draft = { ...target, sizeScale: laukScaleFor(size), portionSize: size };
      }
      const others = prev.filter(f => f.instanceId !== id);
      const resolved = resolveCollisions(draft, others, plateSize.scale * 2);
      placedFoodsRef.current = prev.map(f => (f.instanceId === id ? resolved : f));
      return placedFoodsRef.current;
    });
  }, [selectedFoodId, resolveCollisions, plateSize.scale]);

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

  const selectedSize: PortionSize = selectedFood?.portionSize ?? 'sedang';

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
          trayScreenRef={trayScreenRef}
          onTrayDragStart={handleTrayDragStart}
          onTrayDragEnd={handleTrayDragEnd}
        />

        <div className="canvas-section">
          <ErrorBoundary>
            <div className="canvas-container" id="plate-canvas-wrap">
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
                trayDrag={trayDrag}
                trayScreenRef={trayScreenRef}
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
                <div className="resize-row" role="group" aria-label="Ubah porsi">
                  {SIZE_ORDER.map(size => (
                    <button
                      key={size}
                      type="button"
                      className={`resize-btn${selectedSize === size ? ' active' : ''}`}
                      onClick={() => handleResizeSelected(size)}
                      aria-pressed={selectedSize === size}
                    >
                      {SIZE_LABEL[size]}
                    </button>
                  ))}
                </div>
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

      {/* Size sheet: tap a size to place at a free spot, or drag the size
          button straight onto the plate. Backdrop / Batal / re-tapping the
          chip dismisses without placing. */}
      {pendingType && (
        <div className="size-sheet-backdrop" onClick={() => setPendingType(null)}>
          <div
            className="size-sheet"
            role="dialog"
            aria-label={`Pilih porsi ${pendingType}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="size-sheet-title">Pilih porsi</div>
            <div className="size-sheet-sub">Ketuk untuk taruh · seret ke piring untuk atur posisi</div>
            <div className="size-sheet-row">
              {SIZE_ORDER.map(size => (
                <button
                  key={size}
                  type="button"
                  className="size-btn"
                  onClick={e => {
                    if (sizeSessionRef.current?.dragging || sizeDragging) return;
                    // Pointer taps already placed on pointerup (detail >= 1);
                    // only keyboard activation (detail === 0) places here.
                    if (e.detail === 0) handleSizeTap(size);
                  }}
                  onPointerDown={e => handleSizePointerDown(e, size)}
                  onPointerMove={e => handleSizePointerMove(e, size, pendingType)}
                  onPointerUp={e => handleSizePointerUp(e, size)}
                  onPointerCancel={() => {
                    const s = sizeSessionRef.current;
                    sizeSessionRef.current = null;
                    if (s?.dragging) {
                      trayScreenRef.current = null;
                      handleTrayDragEnd({ x: -1, y: -1 });
                      setSizeDragging(null);
                    }
                  }}
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
      {sizeDragging && pendingType && (
        <div ref={sizeGhostRef} className="tray-ghost" aria-hidden="true">
          <span className="tray-ghost-icon">{PALETTE_ITEMS.find(i => i.id === pendingType)?.icon}</span>
          <span className="tray-ghost-label">
            {PALETTE_ITEMS.find(i => i.id === pendingType)?.nameBahasa} · {SIZE_LABEL[sizeDragging]}
          </span>
        </div>
      )}
    </div>
  );
}

export default App;
