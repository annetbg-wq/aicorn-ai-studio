/**
 * ErrorOverlay — легковесный UI-компонент, который показывается в Shell при откате.
 *
 * Используется, когда новая ревизия содержит ошибку и Shell откатился на последнюю рабочую версию.
 * Показывает сообщение: "Отображена последняя рабочая версия. Новая ревизия содержит ошибку [Тип ошибки]".
 *
 * Компонент автоматически скрывается через несколько секунд или по клику.
 */

import React, { useState, useEffect } from 'react';

export interface ErrorOverlayProps {
  /** Тип ошибки (например, 'runtime', 'syntax', 'render', 'unhandled-rejection') */
  errorType?: string;
  /** Дополнительное сообщение об ошибке */
  errorMessage?: string;
  /** Время автоматического скрытия в миллисекундах (по умолчанию 5000ms, 0 = не скрывать) */
  autoHideDuration?: number;
  /** Колбэк при закрытии оверлея */
  onClose?: () => void;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({
  errorType = 'ошибка',
  errorMessage,
  autoHideDuration = 5000,
  onClose,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (autoHideDuration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, autoHideDuration);
      return () => clearTimeout(timer);
    }
  }, [autoHideDuration, onClose]);

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        maxWidth: 400,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: '#fff',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 9999,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <strong style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ff6b9d' }}>⚠</span> Откат к рабочей версии
        </strong>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: 18,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
      <p style={{ margin: '8px 0', color: 'rgba(255, 255, 255, 0.85)' }}>
        Отображена последняя рабочая версия. Новая ревизия содержит ошибку{' '}
        <strong style={{ color: '#ff6b9d' }}>{errorType}</strong>.
      </p>
      {errorMessage && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 8,
            fontSize: 13,
            color: 'rgba(255, 255, 255, 0.7)',
            maxHeight: 120,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {errorMessage}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'right' }}>
        {autoHideDuration > 0 ? `Скрывается через ${Math.ceil(autoHideDuration / 1000)} сек` : 'Нажмите × чтобы закрыть'}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Хук для управления состоянием ErrorOverlay.
 * Возвращает компонент Overlay и функции show/hide.
 */
export function useErrorOverlay() {
  const [props, setProps] = useState<ErrorOverlayProps | null>(null);

  const show = (overlayProps: ErrorOverlayProps) => {
    setProps(overlayProps);
  };

  const hide = () => {
    setProps(null);
  };

  const Overlay = props ? (
    <ErrorOverlay
      {...props}
      onClose={() => {
        hide();
        props.onClose?.();
      }}
    />
  ) : null;

  return { Overlay, show, hide };
}