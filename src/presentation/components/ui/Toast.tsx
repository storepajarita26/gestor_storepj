'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  /** Botón de acción, p. ej. "Deshacer" */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
    show: (msg: Omit<ToastMessage, 'id'>) => string;
    dismiss: (id: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ type, message, title, duration = 3500, action }: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { id, type, title, message, duration, action };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast]
  );

  const toast = {
    success: (message: string, title?: string) => show({ type: 'success', message, title }),
    error: (message: string, title?: string) => show({ type: 'error', message, title }),
    warning: (message: string, title?: string) => show({ type: 'warning', message, title }),
    info: (message: string, title?: string) => show({ type: 'info', message, title }),
    show,
    dismiss: removeToast,
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Floating Container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => {
          const config = {
            success: {
              border: 'border-emerald-500/40',
              bg: 'bg-emerald-950/90',
              text: 'text-emerald-100',
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
            },
            error: {
              border: 'border-rose-500/40',
              bg: 'bg-rose-950/90',
              text: 'text-rose-100',
              icon: <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
            },
            warning: {
              border: 'border-amber-500/40',
              bg: 'bg-amber-950/90',
              text: 'text-amber-100',
              icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
            },
            info: {
              border: 'border-sky-500/40',
              bg: 'bg-sky-950/90',
              text: 'text-sky-100',
              icon: <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />,
            },
          }[t.type];

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-xl shadow-2xl backdrop-blur-md border ${config.border} ${config.bg} ${config.text} transition-all duration-300 animate-in fade-in slide-in-from-bottom-3`}
            >
              <div className="flex items-start gap-2.5">
                {config.icon}
                <div>
                  {t.title && <h5 className="text-xs font-bold leading-none mb-1">{t.title}</h5>}
                  <p className="text-xs font-medium leading-relaxed opacity-95">{t.message}</p>
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        removeToast(t.id);
                      }}
                      className="mt-2 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold underline-offset-2"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="p-1 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
                title="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}
