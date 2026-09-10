import { useState, useEffect, useRef, useCallback } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import Palette, { PaletteItem } from './components/Palette';
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
  const [dragScreenPos, setDragScreenPos] = useState<{ x: number; y: number } | null>(null);
  const raycastRef = useRef<RaycastHandle>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
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
  
  const handleDragMove = (x: number, y: number) => {
    setDragScreenPos({ x, y });
  };
  
  const handleDragEnd = (itemId: string, x: number, y: number) => {
    const hitPos = raycastRef.current?.raycastPlate({ x, y });
    
    if (hitPos) {
      const foodType = itemId as 'nasi' | 'ayam' | 'telur';
      
      if (foodType === 'nasi') {
        setPlacedFoods(prev => [...prev, {
          instanceId: `${foodType}-${Date.now()}`,
          foodType,
          position: [hitPos.x, 0, hitPos.z],
          config: { radiusX: 1.2, radiusZ: 1.0, height: 0.5 }
        }]);
      } else {
        setPlacedFoods(prev => [...prev, {
          instanceId: `${foodType}-${Date.now()}`,
          foodType,
          position: [hitPos.x, 0.15, hitPos.z]
        }]);
      }
    }
    
    setIsDragging(false);
    setDragScreenPos(null);
  };
  
  const handleFoodUpdate = useCallback((instanceId: string, updates: Partial<PlacedFood>) => {
    setPlacedFoods(prev => prev.map(food => 
      food.instanceId === instanceId ? { ...food, ...updates } : food
    ));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>🍚 Porsi</h1>
          <div className="subtitle">Estimasi Kalori Visual untuk Indonesia</div>
        </div>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? '☀️ Terang' : '🌙 Gelap'}
        </button>
      </header>
      
      <main className="main-content">
        <Palette
          items={PALETTE_ITEMS}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        />
        
        <div className="canvas-section">
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
              dragScreenPos={dragScreenPos}
            />
          </div>
          
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
