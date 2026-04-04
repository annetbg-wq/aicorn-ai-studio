/**
 * ResizableLayout.tsx
 *
 * Заменяет статичный layout в RootLayout.tsx (или App.tsx).
 * Левая панель (чат) — перетаскивается за разделитель.
 * Минимум: 260px, максимум: 520px.
 *
 * Использование в RootLayout.tsx:
 *   import { ResizableLayout } from './ResizableLayout';
 *   <ResizableLayout left={<LeftPanel ... />} right={<PreviewCanvas ... />} />
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ResizableLayoutProps {
  left:         React.ReactNode;
  right:        React.ReactNode;
  defaultWidth?: number;   // px, default 380
  minWidth?:     number;   // px, default 260
  maxWidth?:     number;   // px, default 520
  storageKey?:   string;   // localStorage key для запоминания ширины
}

export const ResizableLayout: React.FC<ResizableLayoutProps> = ({
  left,
  right,
  defaultWidth = 380,
  minWidth     = 260,
  maxWidth     = 520,
  storageKey   = 'aic_panel_width',
}) => {
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return Math.min(maxWidth, Math.max(minWidth, parseInt(saved, 10)));
    } catch { /* ignore */ }
    return defaultWidth;
  });

  const [dragging, setDragging] = useState(false);
  const startX   = useRef(0);
  const startW   = useRef(0);
  const frameRef = useRef<number | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = width;
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - startX.current;
        const next  = Math.min(maxWidth, Math.max(minWidth, startW.current + delta));
        setWidth(next);
      });
    };

    const onUp = () => {
      setDragging(false);
      try { localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [dragging, width, minWidth, maxWidth, storageKey]);

  // Save width on release
  useEffect(() => {
    if (!dragging) {
      try { localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
    }
  }, [dragging, width, storageKey]);

  return (
    <div style={{
      display: 'flex',
      width:   '100%',
      height:  '100%',
      overflow: 'hidden',
      userSelect: dragging ? 'none' : 'auto',
      cursor:     dragging ? 'col-resize' : 'auto',
    }}>
      {/* Left panel */}
      <div style={{
        width:    width,
        minWidth: width,
        maxWidth: width,
        height:   '100%',
        flexShrink: 0,
        overflow: 'hidden',
        transition: dragging ? 'none' : 'width 0.05s',
      }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          width:   dragging ? 4 : 3,
          flexShrink: 0,
          cursor:  'col-resize',
          backgroundColor: dragging
            ? 'rgba(99,102,241,0.7)'
            : 'rgba(255,255,255,0.06)',
          transition: dragging ? 'none' : 'background-color 0.2s, width 0.15s',
          position: 'relative',
          zIndex: 10,
        }}
        onMouseEnter={e => {
          if (!dragging) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(99,102,241,0.4)';
        }}
        onMouseLeave={e => {
          if (!dragging) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.06)';
        }}
      >
        {/* Grip dots */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          opacity: dragging ? 1 : 0.4,
          transition: 'opacity 0.2s',
        }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              width: 2,
              height: 2,
              borderRadius: '50%',
              backgroundColor: dragging ? '#818cf8' : 'rgba(255,255,255,0.5)',
            }} />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }}>
        {right}
      </div>
    </div>
  );
};
