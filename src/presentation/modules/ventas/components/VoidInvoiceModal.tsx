'use client';

import React, { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { SalesInvoice } from '@/domain/sales/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';

interface VoidInvoiceModalProps {
  invoice: SalesInvoice | null;
  onClose: () => void;
  /** Devuelve true si la anulación se registró */
  onConfirm: (invoiceId: string, reason: string) => Promise<boolean>;
}

/** Anulación de factura con motivo obligatorio (revierte existencias o libera el apartado) */
export function VoidInvoiceModal({ invoice, onClose, onConfirm }: VoidInvoiceModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason('');
    setSaving(false);
  }, [invoice]);

  if (!invoice) return null;

  const dispatched = Boolean(invoice.dispatchedAt) || invoice.saleType === 'normal';
  const units = (invoice.items || []).reduce((a, it) => a + it.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    const ok = await onConfirm(invoice.id, reason.trim());
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={Boolean(invoice)}
      onClose={onClose}
      title={`Anular factura ${invoice.invoiceNumber}`}
      subtitle={`${invoice.customerName || 'Cliente general'} · ${formatNIO(invoice.totalNio)}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
          <p className="font-bold">Esta acción no se puede deshacer.</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>
              {dispatched
                ? `Las ${units} unidad(es) vuelven a bodega.`
                : `Se libera el apartado de ${units} unidad(es).`}
            </li>
            <li>El saldo pendiente queda en C$ 0.00.</li>
            {invoice.amountPaidNio > 0 && (
              <li>
                El cliente pagó {formatNIO(invoice.amountPaidNio)}: debe reembolsarse aparte.
              </li>
            )}
          </ul>
        </div>

        <div>
          <label htmlFor="void-reason" className="block text-sm font-bold text-ink mb-1">
            Motivo de la anulación *
          </label>
          <textarea
            id="void-reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Error al registrar la talla; el cliente no retiró el pedido"
            className="w-full bg-white border border-moss/25 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-moss"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-ink hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
          >
            <Ban className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Anulando…' : 'Anular factura'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
