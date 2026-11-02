'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  /** Qué se va a hacer y qué implica (nombre, cantidades afectadas) */
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** Deshabilita el botón de confirmar (p. ej. cuando la operación no está permitida) */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación accesible (reemplaza window.confirm). El foco inicial queda en
 * "Cancelar" para que un Enter accidental no borre nada.
 */
export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => cancelRef.current?.focus(), 0);
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-ink border border-moss/20 rounded-xl hover:bg-surface"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`px-4 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-moss hover:bg-moss-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex gap-3 text-sm text-ink">
        {tone === 'danger' && (
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
        )}
        <div className="space-y-2 leading-relaxed">{children}</div>
      </div>
    </Modal>
  );
}
