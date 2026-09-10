import { useState, useEffect } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import Palette, { PaletteItem } from './components/Palette';
import { RiceMoundConfig, PlateSize, FoodItem, PlacedFood, PLATE_SIZES, INITIAL_FOODS, AYAM_KCAL, TELUR_KCAL } from './types';
import { calculateNutritionEstimate } from './utils/calculations';

const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'nasi', name: 'Rice', nameBahasa: 'Nasi', color: '#f8f8f0', icon: '🍚' },
  { id: 'ayam', name: 'Chicken', nameBahasa: 'Ayam', color: '#d4a574', icon: '🍗' },
  { id: 'telur', name: 'Egg', nameBahasa: 'Telur', color: '#f4e4c1', icon: '🥚' },
];

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [plateSize, setPlateSize] = useState<PlateSize>(PLATE_SIZES[0]);
  const [riceMound, setRiceMound] = useState<RiceMoundConfig>({
    radiusX: 1.2,
    radiusZ: 1.0,
    height: 0.5,
  });
  const [foods, setFoods] = useState<FoodItem[]>(INITIAL_FOODS);
  const [placedFoods, setPlacedFoods] = useState<PlacedFood[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<string | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  const estimate = calculateNutritionEstimate(riceMound);
  
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
  
  const displayEstimate = totalGrams > 0 ? {
    grams: Math.round(totalGrams),
    kcal: Math.round(totalKcal),
    gramsLow: Math.round(totalGrams * 0.8),
    gramsHigh: Math.round(totalGrams * 1.2),
    kcalLow: Math.round(totalKcal * 0.8),
    kcalHigh: Math.round(totalKcal * 1.2),
  } : estimate;

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleFoodToggle = (foodId: string) => {
    setFoods(prev => prev.map(food => 
      food.id === foodId ? { ...food, enabled: !food.enabled } : food
    ));
  };
  
  const handleDragStart = (itemId: string) => {
    setIsDragging(true);
    setDragType(itemId);
  };
  
  const handleDragMove = (x: number, y: number) => {
    setDragScreenPos({ x, y });
  };
  
  const handleDragEnd = () => {
    setIsDragging(false);
    setDragType(null);
    setDragScreenPos(null);
  };
  
  const handleFoodPlaced = (food: PlacedFood) => {
    setPlacedFoods(prev => [...prev, food]);
  };

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
              plateScale={plateSize.scale}
              theme={theme}
              placedFoods={placedFoods}
              onFoodPlaced={handleFoodPlaced}
              isDragging={isDragging}
              dragType={dragType}
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
          riceMound={riceMound}
          onRiceMoundChange={setRiceMound}
          plateSize={plateSize}
          onPlateSizeChange={setPlateSize}
          foods={foods}
          onFoodToggle={handleFoodToggle}
          estimate={estimate}
        />
      </main>
    </div>
  );
}

export default App;
