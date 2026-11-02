'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/presentation/components/ui/Modal';
import { SalesInvoice, DeliveryStatus } from '@/domain/sales/types';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { AlertCircle, PackageCheck, AlertTriangle } from 'lucide-react';

interface DeliveryStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  /** Devuelve true si el cambio se registró */
  onSave: (invoiceId: string, status: DeliveryStatus, notes?: string, trackingRef?: string) => Promise<boolean>;
}

export function DeliveryStatusModal({
  isOpen,
  onClose,
  invoice,
  onSave,
}: DeliveryStatusModalProps) {
  const [status, setStatus] = useState<DeliveryStatus>('pendiente');
  const [notes, setNotes] = useState('');
  const [trackingRef, setTrackingRef] = useState('');
  const [saving, setSaving] = useState(false);

  // Verificar inventario físico disponible en tiempo real
  const stockCheck = useMemo(() => {
    if (!invoice || !invoice.items || invoice.items.length === 0) {
      return { canDispatch: true, missing: [] };
    }
    const currentStockList = dataStore.getStock();
    const missing: { name: string; required: number; available: number }[] = [];

    invoice.items.forEach((item) => {
      const s = currentStockList.find((st) => st.skuId === item.skuId);
      // Existencia física sin tomar lo apartado para OTROS pedidos (la reserva propia sí cuenta)
      const ownReservation = invoice.saleType === 'pedido' ? item.quantity : 0;
      const reservedForOthers = Math.max(0, (s?.quantityReserved || 0) - ownReservation);
      const available = s ? Math.max(0, s.quantityAvailable - reservedForOthers) : 0;
      if (available < item.quantity) {
        missing.push({
          name: item.skuCode || item.productName || 'Prenda',
          required: item.quantity,
          available,
        });
      }
    });

    return {
      canDispatch: missing.length === 0,
      missing,
    };
  }, [invoice, isOpen]);

  useEffect(() => {
    if (invoice) {
      setStatus(invoice.deliveryStatus || 'pendiente');
      setNotes('');
      setTrackingRef(invoice.trackingRef || '');
      setSaving(false);
    }
  }, [invoice]);

  if (!invoice) return null;

  const alreadyDispatched = Boolean(invoice.dispatchedAt) || invoice.saleType === 'normal';
  const isDispatchAttempt = status === 'entregado' || status === 'en_transito' || status === 'listo_entrega';
  const isBlocked = isDispatchAttempt && !stockCheck.canDispatch && !alreadyDispatched;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return; // el aviso de existencia insuficiente ya está a la vista
    setSaving(true);
    const ok = await onSave(invoice.id, status, notes.trim() || undefined, trackingRef.trim() || undefined);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Actualizar Despacho: ${invoice.invoiceNumber}`}
      subtitle={`Cliente: ${invoice.customerName || 'General'} • Modalidad: ${invoice.saleType === 'pedido' ? 'Bajo Pedido (Apartado)' : 'Venta Regular'}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner de alerta si no hay inventario físico */}
        {!stockCheck.canDispatch && !alreadyDispatched && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-900 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Inventario Físico Insuficiente para Despacho</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Esta factura contiene prendas que aún no han sido recibidas en inventario. Las opciones de despacho se encuentran bloqueadas hasta realizar la recepción de aduana.
            </p>
            <ul className="list-disc list-inside text-[11px] font-mono font-medium text-amber-900 pt-1 space-y-0.5">
              {stockCheck.missing.map((m, idx) => (
                <li key={idx}>
                  {m.name}: <span className="font-bold">Disp. {m.available}</span> / Req. {m.required}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1.5">
            Estado de Entrega / Despacho
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DeliveryStatus)}
            className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-moss"
          >
            <option value="pendiente" disabled={alreadyDispatched}>Pendiente de Despacho (En espera de producto)</option>
            <option
              value="en_transito"
              disabled={!stockCheck.canDispatch && !alreadyDispatched}
            >
              En Tránsito (Courier / Mensajería) {!stockCheck.canDispatch && !alreadyDispatched ? '(sin existencia)' : ''}
            </option>
            <option
              value="listo_entrega"
              disabled={!stockCheck.canDispatch && !alreadyDispatched}
            >
              Listo para Entrega en Tienda {!stockCheck.canDispatch && !alreadyDispatched ? '(sin existencia)' : ''}
            </option>
            <option
              value="entregado"
              disabled={!stockCheck.canDispatch && !alreadyDispatched}
            >
              Entregado al Cliente Final {!stockCheck.canDispatch && !alreadyDispatched ? '(sin existencia)' : ''}
            </option>
          </select>
          <p className="text-[11px] text-ink-muted mt-1">
            Para cancelar la venta use el botón &quot;Anular factura&quot; de la tabla: así la mercadería vuelve a bodega o se libera el apartado.
          </p>
        </div>

        <div>
          <label htmlFor="delivery-tracking" className="block text-xs font-bold text-ink-muted mb-1.5">
            No. de guía / encomienda
          </label>
          <input
            id="delivery-tracking"
            value={trackingRef}
            onChange={(e) => setTrackingRef(e.target.value)}
            className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-moss"
            placeholder="Ej. GUIA-MGA-8839"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1.5">
            Notas de entrega
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-surface border border-moss/20 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-moss"
            placeholder="Ej. Recibió en sucursal central / Entregado por mensajero..."
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-moss/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-ink-muted hover:text-ink hover:bg-surface rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isBlocked || saving}
            className="px-5 py-2 text-xs font-bold text-white bg-moss hover:bg-moss-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando…' : 'Guardar Estado'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

