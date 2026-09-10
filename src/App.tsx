import { useState, useEffect, useRef, useCallback } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import Palette, { PaletteItem } from './components/Palette';
import ErrorBoundary from './components/ErrorBoundary';
import { PlateSize, PlacedFood, PLATE_SIZES, AYAM_KCAL, TELUR_KCAL } from './types';
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

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [plateSize, setPlateSize] = useState<PlateSize>(PLATE_SIZES[0]);
  const [placedFoods, setPlacedFoods] = useState<PlacedFood[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragScreenPosRef = useRef<{ x: number; y: number } | null>(null);
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
  
  const handleDragStart = (_itemId: string) => {
    setIsDragging(true);
  };
  
  // Get collision radius for a food item
  const getFoodRadius = useCallback((food: PlacedFood): number => {
    if (food.foodType === 'nasi' && food.config) {
      return Math.max(food.config.radiusX, food.config.radiusZ) * 0.95;
    } else if (food.foodType === 'ayam') {
      return 0.35;
    } else if (food.foodType === 'telur') {
      return 0.30;
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
      instanceId: `nasi-${Date.now()}`,
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

  const handleDragMove = (x: number, y: number) => {
    dragScreenPosRef.current = { x, y };
  };
  
  const handleDragEnd = (itemId: string, x: number, y: number) => {
    const hitPos = raycastRef.current?.raycastPlate({ x, y });
    
    if (hitPos) {
      const foodType = itemId as 'nasi' | 'ayam' | 'telur';
      
      if (foodType === 'nasi') {
        const newNasi: PlacedFood = {
          instanceId: `nasi-${Date.now()}`,
          foodType,
          position: [hitPos.x, 0, hitPos.z],
          config: { radiusX: 1.2, radiusZ: 1.0, height: 0.5 }
        };
        
        setPlacedFoods(prev => {
          const { food: resolvedFood, mergedWith } = resolveCollisions(newNasi, prev, plateSize.scale * 2);
          const filtered = prev.filter(f => !mergedWith.includes(f.instanceId));
          return [...filtered, resolvedFood];
        });
        
        // Select the merged/placed nasi after a short delay to get the correct instanceId
        setTimeout(() => {
          setPlacedFoods(current => {
            const lastNasi = [...current].reverse().find(f => f.foodType === 'nasi');
            if (lastNasi) setSelectedFoodId(lastNasi.instanceId);
            return current;
          });
        }, 10);
      } else {
        const newLauk: PlacedFood = {
          instanceId: `${foodType}-${Date.now()}`,
          foodType,
          position: [hitPos.x, 0.15, hitPos.z]
        };
        
        setPlacedFoods(prev => {
          const { food: resolvedFood, mergedWith } = resolveCollisions(newLauk, prev, plateSize.scale * 2);
          const filtered = prev.filter(f => !mergedWith.includes(f.instanceId));
          return [...filtered, resolvedFood];
        });
      }
    }
    
    setIsDragging(false);
    dragScreenPosRef.current = null;
  };
  
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
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
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
              isDragging={isDragging}
              dragScreenPosRef={dragScreenPosRef}
            />
            </div>
          </ErrorBoundary>
          
          <div className="metrics-dock">
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
        </div>
        
        <ControlPanel
          plateSize={plateSize}
          onPlateSizeChange={setPlateSize}
        />
      </main>
    </div>
  );
}

export default App;
