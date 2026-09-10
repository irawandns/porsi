import { useState, useRef, useCallback } from 'react';

export interface PaletteItem {
  id: string;
  name: string;
  nameBahasa: string;
  color: string;
  icon: string;
}

interface PaletteProps {
  items: PaletteItem[];
  onDragStart: (itemId: string) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (itemId: string, x: number, y: number) => void;
}

export default function Palette({ items, onDragStart, onDragMove, onDragEnd }: PaletteProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
    setDragging(itemId);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    onDragStart(itemId);
  }, [onDragStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragStartPos.current) return;
    
    e.preventDefault();
    onDragMove(e.clientX, e.clientY);
  }, [dragging, onDragMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    
    onDragEnd(dragging, e.clientX, e.clientY);
    setDragging(null);
    dragStartPos.current = null;
  }, [dragging, onDragEnd]);

  return (
    <div className="palette">
      <div className="palette-label">Bahan Makanan</div>
      <div className="palette-chips">
        {items.map(item => (
          <div
            key={item.id}
            className={`palette-chip ${dragging === item.id ? 'dragging' : ''}`}
            style={{ backgroundColor: item.color }}
            onPointerDown={(e) => handlePointerDown(e, item.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <span className="palette-chip-icon">{item.icon}</span>
            <span className="palette-chip-label">{item.nameBahasa}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
