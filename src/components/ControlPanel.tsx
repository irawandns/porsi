import { PlateSize, PLATE_SIZES } from '../types';

interface ControlPanelProps {
  plateSize: PlateSize;
  onPlateSizeChange: (size: PlateSize) => void;
}

export default function ControlPanel({
  plateSize,
  onPlateSizeChange,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
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
