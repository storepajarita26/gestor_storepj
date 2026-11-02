'use client';

import React, { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { StockLevel, AdjustmentType, InventoryAdjustmentInput } from '@/domain/inventory/types';

interface AdjustmentModalProps {
  stock: StockLevel | null;
  onClose: () => void;
  /** Devuelve true si el ajuste se registró */
  onConfirm: (input: InventoryAdjustmentInput) => Promise<boolean>;
}

const TYPES: { value: AdjustmentType; label: string; help: string }[] = [
  { value: 'conteo', label: 'Conteo físico', help: 'Escriba cuántas unidades contó; se registra la diferencia.' },
  { value: 'merma', label: 'Merma (daño o pérdida)', help: 'Unidades que salen por daño, robo o extravío.' },
  { value: 'regalia', label: 'Regalía / promoción', help: 'Unidades entregadas como obsequio.' },
  { value: 'entrada', label: 'Entrada sin compra', help: 'Sobrante encontrado u otra entrada que no viene de una orden.' },
];

/** Ajuste manual de inventario con motivo obligatorio (queda en el kardex con número AJ-) */
export function AdjustmentModal({ stock, onClose, onConfirm }: AdjustmentModalProps) {
  const [tipo, setTipo] = useState<AdjustmentType>('conteo');
  const [cantidad, setCantidad] = useState<number>(0);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTipo('conteo');
    setCantidad(stock?.quantityAvailable ?? 0);
    setMotivo('');
    setSaving(false);
  }, [stock]);

  if (!stock) return null;

  const current = stock.quantityAvailable;
  const resulting =
    tipo === 'conteo' ? cantidad : tipo === 'entrada' ? current + cantidad : current - cantidad;
  const invalid =
    !motivo.trim() ||
    cantidad < 0 ||
    (tipo !== 'conteo' && cantidad <= 0) ||
    (tipo === 'conteo' && cantidad === current) ||
    resulting < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    const ok = await onConfirm({ skuId: stock.skuId, tipo, cantidad, motivo: motivo.trim() });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={Boolean(stock)}
      onClose={onClose}
      title={`Ajustar inventario: ${stock.skuCode}`}
      subtitle={`${stock.skuDescription || stock.skuCode} · Existencia actual: ${current} (apartado: ${stock.quantityReserved || 0})`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <fieldset>
          <legend className="text-sm font-bold text-ink mb-2">Tipo de ajuste</legend>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={`p-2.5 rounded-xl border cursor-pointer ${
                  tipo === t.value ? 'border-moss bg-moss/5' : 'border-moss/20 hover:bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name="adj-type"
                  value={t.value}
                  checked={tipo === t.value}
                  onChange={() => {
                    setTipo(t.value);
                    setCantidad(t.value === 'conteo' ? current : 0);
                  }}
                  className="sr-only"
                />
                <span className="font-semibold text-ink block">{t.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-2">{TYPES.find((t) => t.value === tipo)?.help}</p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label htmlFor="adj-qty" className="block text-sm font-bold text-ink mb-1">
              {tipo === 'conteo' ? 'Unidades contadas' : 'Unidades'}
            </label>
            <input
              id="adj-qty"
              type="number"
              min={0}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full bg-white border border-moss/25 rounded-xl px-3 py-2 tabular-nums"
            />
          </div>
          <p className={`text-sm pb-2 ${resulting < 0 ? 'text-rose-700 font-semibold' : 'text-ink-muted'}`}>
            Quedará en <strong className="tabular-nums">{resulting}</strong>
            {resulting < (stock.quantityReserved || 0) && resulting >= 0 && (
              <span className="block text-amber-700 text-xs">Por debajo de lo apartado ({stock.quantityReserved}).</span>
            )}
          </p>
        </div>

        <div>
          <label htmlFor="adj-reason" className="block text-sm font-bold text-ink mb-1">
            Motivo *
          </label>
          <input
            id="adj-reason"
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Conteo mensual de octubre; prenda manchada"
            className="w-full bg-white border border-moss/25 rounded-xl px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-semibold text-ink hover:bg-surface">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || invalid}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white bg-moss hover:bg-moss-700 disabled:opacity-50"
          >
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Registrando…' : 'Registrar ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
