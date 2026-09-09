import { RiceMoundConfig, PlateSize, FoodItem, NutritionEstimate, PLATE_SIZES } from '../types';

interface ControlPanelProps {
  riceMound: RiceMoundConfig;
  onRiceMoundChange: (config: RiceMoundConfig) => void;
  plateSize: PlateSize;
  onPlateSizeChange: (size: PlateSize) => void;
  foods: FoodItem[];
  onFoodToggle: (foodId: string) => void;
  estimate: NutritionEstimate;
}

export default function ControlPanel({
  riceMound,
  onRiceMoundChange,
  plateSize,
  onPlateSizeChange,
  foods,
  onFoodToggle,
  estimate,
}: ControlPanelProps) {
  const totalKcal = estimate.kcal + foods.reduce((sum, food) => 
    food.enabled ? sum + food.kcal : sum, 0
  );
  
  return (
    <div className="control-panel">
      <div className="control-section">
        <h3>🍚 Bentuk Nasi</h3>
        
        <label>Lebar (X): {riceMound.radiusX.toFixed(2)}</label>
        <input
          type="range"
          min="0.3"
          max="2.0"
          step="0.05"
          value={riceMound.radiusX}
          onChange={(e) => onRiceMoundChange({
            ...riceMound,
            radiusX: parseFloat(e.target.value)
          })}
        />
        
        <label>Panjang (Z): {riceMound.radiusZ.toFixed(2)}</label>
        <input
          type="range"
          min="0.3"
          max="2.0"
          step="0.05"
          value={riceMound.radiusZ}
          onChange={(e) => onRiceMoundChange({
            ...riceMound,
            radiusZ: parseFloat(e.target.value)
          })}
        />
        
        <label>Tinggi: {riceMound.height.toFixed(2)}</label>
        <input
          type="range"
          min="0.1"
          max="1.5"
          step="0.05"
          value={riceMound.height}
          onChange={(e) => onRiceMoundChange({
            ...riceMound,
            height: parseFloat(e.target.value)
          })}
        />
      </div>

      <div className="control-section">
        <h3>🍽️ Ukuran Piring</h3>
        <div className="preset-buttons">
          {PLATE_SIZES.map(size => (
            <button
              key={size.id}
              className={`preset-btn ${plateSize.id === size.id ? 'active' : ''}`}
              onClick={() => onPlateSizeChange(size)}
            >
              <div>{size.nameBahasa}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{size.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="control-section">
        <h3>📊 Estimasi Nasi</h3>
        
        <div className="estimate-card highlight">
          <div className="estimate-value">{estimate.kcal}</div>
          <div className="estimate-label">kalori (kcal)</div>
          
          <div className="value-display">
            <span>Berat:</span>
            <strong>{estimate.grams}g</strong>
          </div>
          
          <div className="estimate-range">
            <strong>Rentang:</strong> {estimate.kcalLow}–{estimate.kcalHigh} kcal<br />
            ({estimate.gramsLow}–{estimate.gramsHigh}g)
          </div>
        </div>
        
        <div className="indonesian-unit">
          ≈ <strong>{estimate.sendokMakan}</strong> sendok makan<br />
          ≈ <strong>{estimate.centong}</strong> centong
        </div>
      </div>

      <div className="control-section">
        <h3>🍗 Lauk Tambahan</h3>
        <div className="food-items">
          {foods.map(food => (
            <div key={food.id} className="food-item-control">
              <label>
                <input
                  type="checkbox"
                  checked={food.enabled}
                  onChange={() => onFoodToggle(food.id)}
                />
                <span>{food.nameBahasa}</span>
              </label>
              <span className="food-kcal">+{food.kcal} kcal</span>
            </div>
          ))}
        </div>
      </div>

      {foods.some(f => f.enabled) && (
        <div className="control-section">
          <div className="estimate-card">
            <div className="estimate-value" style={{ fontSize: '2rem' }}>
              {totalKcal}
            </div>
            <div className="estimate-label">total kalori (nasi + lauk)</div>
          </div>
        </div>
      )}

      <div className="control-section">
        <div className="disclaimer">
          <strong>⚠️ Catatan Penting</strong><br />
          Estimasi ini memiliki margin error ±20%. Tujuannya untuk melatih mata 
          dan tracking kalori yang <em>cukup baik</em>, bukan presisi laboratorium. 
          Asumsi: nasi putih matang (1.15 g/ml, ~130 kcal/100g).
        </div>
      </div>
    </div>
  );
}
