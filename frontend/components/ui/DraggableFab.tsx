/**
 * DraggableFab — Draggable Floating Action Button
 *
 * A reusable FAB that supports free-drag to any screen position.
 * Used by both professor (amber) and student (blue) views.
 */

import React, { useRef, useState } from 'react';

export interface DraggableFabProps {
  variant: 'professor' | 'student';
  badge: number;
  onFabClick: () => void;
  onDismiss: () => void;
}

const DraggableFab: React.FC<DraggableFabProps> = ({ variant, badge, onFabClick, onDismiss }) => {
  const isProfessor = variant === 'professor';
  const fabRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false });
  const [pos, setPos] = useState({ x: 0, y: 0 });   // offset from default bottom-right
  const [isDragging, setIsDragging] = useState(false);

  const onMouseDown = (e: React.MouseEvent) => {
    // Ignore if target is the close button
    if ((e.target as HTMLElement).closest('[data-fab-close]')) return;
    e.preventDefault();
    const ds = dragState.current;
    ds.dragging = true;
    ds.moved = false;
    ds.startX = e.clientX;
    ds.startY = e.clientY;
    ds.offsetX = pos.x;
    ds.offsetY = pos.y;

    const onMove = (ev: MouseEvent) => {
      if (!ds.dragging) return;
      const dx = ev.clientX - ds.startX;
      const dy = ev.clientY - ds.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        ds.moved = true;
        setIsDragging(true);
      }
      if (ds.moved) {
        setPos({ x: ds.offsetX + dx, y: ds.offsetY + dy });
      }
    };
    const onUp = () => {
      ds.dragging = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Only fire click if we didn't drag
      if (!ds.moved) {
        onFabClick();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={fabRef}
      className="fixed z-[60] group"
      style={{
        bottom: `${24 - pos.y}px`,
        right: `${24 - pos.x}px`,
        animation: pos.x === 0 && pos.y === 0 ? 'fabSlideIn 0.35s cubic-bezier(.4,0,.2,1)' : undefined,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* Close FAB button */}
      <button
        data-fab-close
        onClick={onDismiss}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-600/80 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-800 shadow-md z-10"
        title="Permanently dismiss"
      >
        ✕
      </button>
      {/* FAB body */}
      <div
        onMouseDown={onMouseDown}
        className={`w-12 h-12 rounded-full text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center text-lg relative ${
          isProfessor
            ? 'bg-gradient-to-br from-amber-400 to-amber-600'
            : 'bg-gradient-to-br from-blue-400 to-blue-600'
        }`}
        title={isProfessor ? 'AI Curriculum Suggestions' : 'Module Updates'}
      >
        {isProfessor ? '🤖' : '✨'}
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
          {badge}
        </span>
      </div>
      {/* Inline keyframes */}
      <style>{`
        @keyframes fabSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.8); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default DraggableFab;
