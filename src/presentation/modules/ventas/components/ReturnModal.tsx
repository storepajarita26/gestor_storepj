'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { SalesInvoice, ReturnInput } from '@/domain/sales/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';

interface ReturnModalProps {
  invoice: SalesInvoice | null;
  onClose: () => void;
  /** Devuelve true si la devolución se registró */
  onConfirm: (input: ReturnInput) => Promise<boolean>;
}

interface ReturnLine {
  skuId: string;
  label: string;
  detail: string;
  maxQty: number;
  unitAmount: number;
}

/** Devolución parcial: genera una nota de crédito por las prendas devueltas */
export function ReturnModal({ invoice, onClose, onConfirm }: ReturnModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuantities({});
    setReason('');
    setRestock(true);
    setSaving(false);
  }, [invoice]);

  // Una línea por SKU con lo que aún se puede devolver
  const lines: ReturnLine[] = useMemo(() => {
    if (!invoice) return [];
    const returned = new Map<string, number>();
    (invoice.creditNotes || []).forEach((cn) =>
      (cn.items || []).forEach((ci) => returned.set(ci.skuId, (returned.get(ci.skuId) || 0) + ci.quantity))
    );
    const bySku = new Map<string, ReturnLine & { sold: number; total: number }>();
    (invoice.items || []).forEach((it) => {
      const prev = bySku.get(it.skuId);
      const sold = (prev?.sold || 0) + it.quantity;
      const total = (prev?.total || 0) + (it.lineTotalNio || 0);
      bySku.set(it.skuId, {
        skuId: it.skuId,
        label: it.productName || it.skuCode || 'Prenda',
        detail: [it.skuCode, it.size && `Talla ${it.size}`, it.colorName].filter(Boolean).join(' · '),
        sold,
        total,
        maxQty: 0,
        unitAmount: 0,
      });
    });
    return Array.from(bySku.values()).map((l) => ({
      ...l,
      maxQty: Math.max(0, l.sold - (returned.get(l.skuId) || 0)),
      unitAmount: l.sold > 0 ? l.total / l.sold : 0,
    }));
  }, [invoice]);

  if (!invoice) return null;

  const creditTotal = lines.reduce((a, l) => a + (quantities[l.skuId] || 0) * l.unitAmount, 0);
  const anyQty = lines.some((l) => (quantities[l.skuId] || 0) > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anyQty || !reason.trim()) return;
    setSaving(true);
    const ok = await onConfirm({
      invoiceId: invoice.id,
      reason: reason.trim(),
      restock,
      items: lines
        .filter((l) => (quantities[l.skuId] || 0) > 0)
        .map((l) => ({ skuId: l.skuId, quantity: quantities[l.skuId] })),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={Boolean(invoice)}
      onClose={onClose}
      title={`Devolución en ${invoice.invoiceNumber}`}
      subtitle={`${invoice.customerName || 'Cliente general'} · Total ${formatNIO(invoice.totalNio)}`}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-ink-muted border-b border-moss/10">
              <th className="py-2 font-semibold">Prenda</th>
              <th className="py-2 font-semibold text-right">Precio cobrado</th>
              <th className="py-2 font-semibold text-right w-32">Devuelve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-moss/10">
            {lines.map((l) => (
              <tr key={l.skuId}>
                <td className="py-2">
                  <span className="font-semibold text-ink block">{l.label}</span>
                  <span className="text-xs text-ink-muted">{l.detail}</span>
                </td>
                <td className="py-2 text-right tabular-nums">{formatNIO(l.unitAmount)}</td>
                <td className="py-2 text-right">
                  <label className="sr-only" htmlFor={`ret-${l.skuId}`}>Unidades devueltas de {l.label}</label>
                  <input
                    id={`ret-${l.skuId}`}
                    type="number"
                    min={0}
                    max={l.maxQty}
                    disabled={l.maxQty === 0}
                    value={quantities[l.skuId] ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(l.maxQty, parseInt(e.target.value, 10) || 0));
                      setQuantities((q) => ({ ...q, [l.skuId]: v }));
                    }}
                    className="w-20 text-right bg-white border border-moss/25 rounded-lg px-2 py-1.5 tabular-nums disabled:bg-surface"
                  />
                  <span className="block text-xs text-ink-muted mt-0.5">de {l.maxQty}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <label htmlFor="return-reason" className="block text-sm font-bold text-ink mb-1">
            Motivo de la devolución *
          </label>
          <input
            id="return-reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Talla incorrecta"
            className="w-full bg-white border border-moss/25 rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-moss"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
            className="mt-1"
          />
          <span>
            Las prendas vuelven a bodega para la venta
            <span className="block text-xs text-ink-muted">Desmarque si llegaron dañadas (no se suman a la existencia).</span>
          </span>
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-moss/10">
          <div>
            <span className="block text-xs text-ink-muted">Nota de crédito</span>
            <span className="text-lg font-extrabold text-ink tabular-nums">{formatNIO(creditTotal)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-semibold text-ink hover:bg-surface">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !anyQty || !reason.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white bg-moss hover:bg-moss-700 disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" />
              {saving ? 'Registrando…' : 'Registrar devolución'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
