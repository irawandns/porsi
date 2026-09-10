import { useState, useEffect, useRef, useCallback } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import Palette, { PaletteItem } from './components/Palette';
import ErrorBoundary from './components/ErrorBoundary';
import { PlateSize, PlacedFood, PLATE_SIZES, AYAM_KCAL, TELUR_KCAL } from './types';
import { calculateNutritionEstimate } from './utils/calculations';
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
      return Math.max(food.config.radiusX, food.config.radiusZ) * 0.95; // Slight forgiveness
    } else if (food.foodType === 'ayam') {
      return 0.35; // Box is ~0.6x0.5, use conservative radius
    } else if (food.foodType === 'telur') {
      return 0.30; // Sphere radius 0.3
    }
    return 0.3;
  }, []);

  // Resolve overlaps by gently pushing the moving food away from others
  const resolveOverlaps = useCallback((
    movingFood: PlacedFood,
    existingFoods: PlacedFood[],
    plateRadius: number,
    maxPushDist: number = 1.5 // Prevent teleporting
  ): [number, number, number] | null => {
    let x = movingFood.position[0];
    let z = movingFood.position[2];
    const y = movingFood.position[1];
    const startX = x;
    const startZ = z;
    const movingRadius = getFoodRadius(movingFood);
    const epsilon = 0.05; // Small gap between foods
    
    // Multi-pass: iterative separation until fully separated
    const maxPasses = 5;
    for (let pass = 0; pass < maxPasses; pass++) {
      let anyOverlap = false;
      
      for (const other of existingFoods) {
        if (other.instanceId === movingFood.instanceId) continue;
        
        const otherRadius = getFoodRadius(other);
        const dx = x - other.position[0];
        const dz = z - other.position[2];
        let dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = movingRadius + otherRadius + epsilon;
        
        if (dist < minDist) {
          anyOverlap = true;
          
          // Handle zero-distance case with random jitter
          if (dist < 0.001) {
            const angle = Math.random() * Math.PI * 2;
            const jitterDist = minDist * 0.5;
            x += Math.cos(angle) * jitterDist;
            z += Math.sin(angle) * jitterDist;
            continue;
          }
          
          // Full push to separate on this pass (not divided)
          const pushDist = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          x += nx * pushDist;
          z += nz * pushDist;
        }
      }
      
      if (!anyOverlap) break; // Fully separated, exit early
    }
    
    // Clamp to plate first
    let plateDist = Math.sqrt(x * x + z * z);
    const maxDist = plateRadius * 0.9;
    if (plateDist > maxDist) {
      const scale = maxDist / plateDist;
      x *= scale;
      z *= scale;
      
      // Re-check overlaps after clamp (might have pushed back into others)
      // One more pass to adjust if needed
      for (const other of existingFoods) {
        if (other.instanceId === movingFood.instanceId) continue;
        
        const otherRadius = getFoodRadius(other);
        const dx = x - other.position[0];
        const dz = z - other.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = movingRadius + otherRadius + epsilon;
        
        if (dist < minDist && dist > 0.001) {
          // Small adjustment after clamp
          const pushDist = (minDist - dist) * 0.5; // Gentler post-clamp
          const nx = dx / dist;
          const nz = dz / dist;
          x += nx * pushDist;
          z += nz * pushDist;
        }
      }
      
      // Re-clamp if adjustment pushed us out again
      plateDist = Math.sqrt(x * x + z * z);
      if (plateDist > maxDist) {
        const scale = maxDist / plateDist;
        x *= scale;
        z *= scale;
      }
    }
    
    // Check total displacement to prevent teleporting
    const totalPush = Math.sqrt((x - startX) ** 2 + (z - startZ) ** 2);
    if (totalPush > maxPushDist) {
      // Unresolvable without teleporting - return null
      return null;
    }
    
    return [x, y, z];
  }, [getFoodRadius]);

  const handleDragMove = (x: number, y: number) => {
    dragScreenPosRef.current = { x, y };
  };
  
  const handleDragEnd = (itemId: string, x: number, y: number) => {
    const hitPos = raycastRef.current?.raycastPlate({ x, y });
    
    if (hitPos) {
      const foodType = itemId as 'nasi' | 'ayam' | 'telur';
      
      if (foodType === 'nasi') {
        const newFood: PlacedFood = {
          instanceId: `${foodType}-${Date.now()}`,
          foodType,
          position: [hitPos.x, 0, hitPos.z],
          config: { radiusX: 1.2, radiusZ: 1.0, height: 0.5 }
        };
        const resolvedPos = resolveOverlaps(newFood, placedFoods, plateSize.scale * 2);
        if (resolvedPos) {
          newFood.position = resolvedPos;
          setPlacedFoods(prev => [...prev, newFood]);
        }
        // If null (unresolvable), refuse silently - no placement
      } else {
        const newFood: PlacedFood = {
          instanceId: `${foodType}-${Date.now()}`,
          foodType,
          position: [hitPos.x, 0.15, hitPos.z]
        };
        const resolvedPos = resolveOverlaps(newFood, placedFoods, plateSize.scale * 2);
        if (resolvedPos) {
          newFood.position = resolvedPos;
          setPlacedFoods(prev => [...prev, newFood]);
        }
        // If null (unresolvable), refuse silently - no placement
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
      
      // Only resolve overlaps if position changed (place + body-drag)
      // Do NOT resolve on config-only changes (height/footprint sculpt)
      if (updates.position) {
        const movingFood = updatedFoods.find(f => f.instanceId === instanceId);
        if (movingFood) {
          const others = updatedFoods.filter(f => f.instanceId !== instanceId);
          // Higher maxPushDist for drag (2.5) to allow more freedom during sculpt
          const resolvedPos = resolveOverlaps(movingFood, others, plateSize.scale * 2, 2.5);
          if (resolvedPos) {
            return updatedFoods.map(food =>
              food.instanceId === instanceId
                ? { ...food, position: resolvedPos }
                : food
            );
          }
          // If unresolvable, keep previous position (but still apply config if present)
          return prev.map(food =>
            food.instanceId === instanceId
              ? { ...food, ...(updates.config ? { config: updates.config } : {}) }
              : food
          );
        }
      }
      
      // Config-only or other updates: apply without collision check
      return updatedFoods;
    });
  }, [resolveOverlaps, plateSize.scale]);

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
