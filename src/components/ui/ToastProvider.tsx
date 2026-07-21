'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { Toast } from './Toast';
import styles from './ToastProvider.module.css';

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'danger';
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, tone: ToastItem['tone']) => {
    const id = nextToastId++;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const value: ToastContextValue = {
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'danger'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack}>
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} tone={t.tone} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Throws if used outside `ToastProvider` (mounted once in the root layout)
 * — a missing provider is a wiring bug, not a recoverable state. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
