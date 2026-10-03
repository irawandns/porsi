import { useRef, useState } from 'react';
import { FoodType, PortionSize } from '../types';

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
  trayScreenRef: React.MutableRefObject<{ x: number; y: number } | null>;
  /** Called once when a tray drag lifts off. Default drag size is Sedang. */
  onTrayDragStart: (foodType: FoodType, size: PortionSize) => void;
  /** Called once on release. Returns true when the drop landed on the plate. */
  onTrayDragEnd: (screenPos: { x: number; y: number }) => boolean;
}

const DRAG_THRESHOLD_PX = 10;
const DEFAULT_DRAG_SIZE: PortionSize = 'sedang';

// Toca-style tray: press-and-drag a chip onto the plate. A tap (no drag)
// still opens the size sheet. The floating HTML ghost follows the finger
// outside the canvas via direct DOM transforms (no React state per move);
// the 3D lift/tilt/shadow preview inside the canvas is driven by
// trayScreenRef reads in Plate3D's useFrame.
export default function Palette({ items, selectedId, onSelect, trayScreenRef, onTrayDragStart, onTrayDragEnd }: PaletteProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    dragging: boolean;
    chipRect: DOMRect | null;
  } | null>(null);

  const moveGhost = (x: number, y: number) => {
    const el = ghostRef.current;
    if (el) {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -70%) scale(1.12)`;
    }
  };

  const snapGhostBack = (chipRect: DOMRect | null) => {
    const el = ghostRef.current;
    if (!el) return;
    if (chipRect) {
      el.style.transition = 'transform 180ms ease-out';
      const cx = chipRect.left + chipRect.width / 2;
      const cy = chipRect.top + chipRect.height / 2;
      el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -70%) scale(1)`;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, item: PaletteItem) => {
    sessionRef.current = {
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      chipRect: e.currentTarget.getBoundingClientRect(),
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — pointer capture is best-effort on mobile Safari
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>, item: PaletteItem) => {
    const s = sessionRef.current;
    if (!s || s.id !== item.id) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!s.dragging) {
      s.dragging = true;
      setDraggingId(item.id);
      trayScreenRef.current = { x: e.clientX, y: e.clientY };
      onTrayDragStart(item.id as FoodType, DEFAULT_DRAG_SIZE);
      requestAnimationFrame(() => moveGhost(e.clientX, e.clientY));
    } else {
      trayScreenRef.current = { x: e.clientX, y: e.clientY };
      moveGhost(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>, item: PaletteItem) => {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (!s || s.id !== item.id) return;
    if (!s.dragging) {
      // Tap — open the size sheet.
      onSelect(item.id);
      return;
    }
    const dropPos = { x: e.clientX, y: e.clientY };
    trayScreenRef.current = null;
    const placed = onTrayDragEnd(dropPos);
    if (placed) {
      setDraggingId(null);
    } else {
      // Snap back to the chip so food never lands in empty space.
      snapGhostBack(s.chipRect);
      window.setTimeout(() => setDraggingId(null), 190);
    }
  };

  const handlePointerCancel = () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (!s?.dragging) return;
    trayScreenRef.current = null;
    try {
      onTrayDragEnd({ x: -1, y: -1 });
    } catch {
      // ignore
    }
    snapGhostBack(s.chipRect);
    window.setTimeout(() => setDraggingId(null), 190);
  };

  const draggingItem = items.find(i => i.id === draggingId) ?? null;

  return (
    <div className="palette">
      <div className="palette-label">Bahan Makanan</div>
      <div className="palette-chips">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className={`palette-chip${selectedId === item.id ? ' selected' : ''}${draggingId === item.id ? ' dragging' : ''}`}
            style={{ backgroundColor: item.color }}
            onClick={e => {
              // Pointer taps toggle via pointerup; only keyboard activation
              // (detail === 0) opens the sheet from click.
              if (e.detail === 0) onSelect(item.id);
            }}
            onPointerDown={e => handlePointerDown(e, item)}
            onPointerMove={e => handlePointerMove(e, item)}
            onPointerUp={e => handlePointerUp(e, item)}
            onPointerCancel={handlePointerCancel}
            aria-pressed={selectedId === item.id}
          >
            <span className="palette-chip-icon">{item.icon}</span>
            <span className="palette-chip-label">{item.nameBahasa}</span>
            <span className="palette-chip-hint">seret</span>
          </button>
        ))}
      </div>
      {draggingItem && (
        <div ref={ghostRef} className="tray-ghost" aria-hidden="true">
          <span className="tray-ghost-icon">{draggingItem.icon}</span>
          <span className="tray-ghost-label">{draggingItem.nameBahasa}</span>
        </div>
      )}
    </div>
  );
}
