export interface PaletteItem {
  id: string;
  name: string;
  nameBahasa: string;
  color: string;
  icon: string;
}

interface PaletteProps {
  items: PaletteItem[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
}

// Tap-to-choose chip tray. There is intentionally no pointer-capture drag
// path here: tapping a chip opens the size sheet, and the size tap spawns
// the food via a 3D pour. This keeps the add flow one-handed on phones.
export default function Palette({ items, selectedId, onSelect }: PaletteProps) {
  return (
    <div className="palette">
      <div className="palette-label">Bahan Makanan</div>
      <div className="palette-chips">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className={`palette-chip${selectedId === item.id ? ' selected' : ''}`}
            style={{ backgroundColor: item.color }}
            onClick={() => onSelect(item.id)}
            aria-pressed={selectedId === item.id}
          >
            <span className="palette-chip-icon">{item.icon}</span>
            <span className="palette-chip-label">{item.nameBahasa}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
