import { useState, useEffect } from 'react';
import Plate3D from './components/Plate3D';
import ControlPanel from './components/ControlPanel';
import { RiceMoundConfig, PlateSize, FoodItem, PLATE_SIZES, INITIAL_FOODS } from './types';
import { calculateNutritionEstimate } from './utils/calculations';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [plateSize, setPlateSize] = useState<PlateSize>(PLATE_SIZES[0]);
  const [riceMound, setRiceMound] = useState<RiceMoundConfig>({
    radiusX: 1.2,
    radiusZ: 1.0,
    height: 0.5,
  });
  const [foods, setFoods] = useState<FoodItem[]>(INITIAL_FOODS);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const estimate = calculateNutritionEstimate(riceMound);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleFoodToggle = (foodId: string) => {
    setFoods(prev => prev.map(food => 
      food.id === foodId ? { ...food, enabled: !food.enabled } : food
    ));
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
        <div className="canvas-container">
          <Plate3D
            plateScale={plateSize.scale}
            riceMound={riceMound}
            onRiceMoundChange={setRiceMound}
            foods={foods}
            theme={theme}
          />
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
