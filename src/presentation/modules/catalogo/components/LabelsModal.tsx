'use client';

import React, { useMemo, useState } from 'react';
import { Printer, Search, Plus, Minus, X } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { Barcode } from '@/presentation/components/ui/Barcode';
import { Product } from '@/domain/catalog/types';
import { normalizeSearch } from '@/domain/sales/services/customerService';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface LabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

interface LabelSku {
  skuId: string;
  skuCode: string;
  name: string;
  detail: string;
  price: number;
  regularPrice: number;
  stock: number;
}

/**
 * Etiquetas con código de barras para las prendas: se imprimen en hoja carta (3 columnas)
 * y se leen con cualquier lector USB en el punto de venta.
 */
export function LabelsModal({ isOpen, onClose, products }: LabelsModalProps) {
  const [query, setQuery] = useState('');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const storeName = dataStore.getStoreSettings().storeName || 'Pajarita Store';

  const allSkus: LabelSku[] = useMemo(() => {
    if (!isOpen) return [];
    const stock = new Map(dataStore.getStock().map((s) => [s.skuId, s.quantityAvailable || 0]));
    return products.flatMap((p) =>
      (p.skus || [])
        .filter((s) => s.isActive !== false)
        .map((s) => {
          const promo = s.promoPriceNio && s.promoPriceNio > 0 && s.promoPriceNio < s.salePriceNio ? s.promoPriceNio : undefined;
          return {
            skuId: s.id,
            skuCode: s.skuCode,
            name: p.name,
            detail: [s.size, s.colorName].filter(Boolean).join(' · '),
            price: promo ?? s.salePriceNio,
            regularPrice: s.salePriceNio,
            stock: Math.max(0, stock.get(s.id) || 0),
          };
        })
    );
  }, [products, isOpen]);

  const matches = useMemo(() => {
    const ws = normalizeSearch(query.trim()).split(/\s+/).filter(Boolean);
    if (ws.length === 0) return allSkus.slice(0, 30);
    return allSkus.filter((s) => ws.every((w) => normalizeSearch(`${s.skuCode} ${s.name} ${s.detail}`).includes(w))).slice(0, 30);
  }, [allSkus, query]);

  const selected = allSkus.filter((s) => (copies[s.skuId] || 0) > 0);
  const labels = selected.flatMap((s) => Array.from({ length: copies[s.skuId] }, (_, i) => ({ ...s, key: `${s.skuId}-${i}` })));

  const setCount = (skuId: string, n: number) => setCopies((prev) => ({ ...prev, [skuId]: Math.max(0, Math.min(500, n)) }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Imprimir etiquetas"
      subtitle="Código de barras para escanear en el punto de venta"
      maxWidth="5xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">{labels.length} etiqueta(s) · hoja carta, 3 columnas</p>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={labels.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-moss hover:bg-moss-700 text-white text-sm font-bold disabled:opacity-40"
          >
            <Printer className="w-4 h-4" aria-hidden="true" /> Imprimir
          </button>
        </div>
      }
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 print:block">
        {/* Selección */}
        <div className="space-y-3 print:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <label htmlFor="labels-search" className="sr-only">Buscar prenda</label>
            <input
              id="labels-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código, nombre, talla o color"
              className="w-full border border-moss/20 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"
            />
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => matches.forEach((s) => setCount(s.skuId, Math.max(1, s.stock)))}
              className="px-2.5 py-1 rounded-lg border border-moss/20 font-semibold hover:bg-surface"
              title="Una etiqueta por cada unidad en bodega de los resultados"
            >
              Una por unidad en bodega
            </button>
            {selected.length > 0 && (
              <button type="button" onClick={() => setCopies({})} className="px-2.5 py-1 rounded-lg font-semibold text-rose-700 hover:bg-rose-50">
                Quitar todas
              </button>
            )}
          </div>
          <ul className="border border-moss/10 rounded-xl divide-y divide-moss/10 max-h-[50vh] overflow-y-auto">
            {matches.map((s) => {
              const n = copies[s.skuId] || 0;
              return (
                <li key={s.skuId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink truncate">{s.name}</p>
                    <p className="text-xs text-ink-muted">
                      <span className="font-mono">{s.skuCode}</span>
                      {s.detail && ` · ${s.detail}`} · {s.stock} en bodega
                    </p>
                  </div>
                  {n === 0 ? (
                    <button
                      type="button"
                      onClick={() => setCount(s.skuId, Math.max(1, s.stock))}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-moss/10 text-moss text-xs font-bold hover:bg-moss/20"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Agregar
                    </button>
                  ) : (
                    <div className="flex items-center gap-1" role="group" aria-label={`Copias de ${s.skuCode}`}>
                      <button type="button" onClick={() => setCount(s.skuId, n - 1)} className="w-7 h-7 rounded-lg border border-moss/20 flex items-center justify-center" aria-label="Una menos">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={n}
                        onChange={(e) => setCount(s.skuId, parseInt(e.target.value, 10) || 0)}
                        className="w-12 text-center border border-moss/20 rounded-lg py-1 text-sm tabular-nums"
                        aria-label="Copias"
                      />
                      <button type="button" onClick={() => setCount(s.skuId, n + 1)} className="w-7 h-7 rounded-lg border border-moss/20 flex items-center justify-center" aria-label="Una más">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setCount(s.skuId, 0)} className="w-7 h-7 rounded-lg text-ink-muted hover:text-rose-700 flex items-center justify-center" aria-label="Quitar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">Ninguna prenda coincide.</li>}
          </ul>
        </div>

        {/* Vista previa / hoja a imprimir */}
        <div className="bg-surface rounded-xl p-3 max-h-[60vh] overflow-y-auto print:bg-white print:p-0 print:max-h-none print:overflow-visible">
          {labels.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-10 print:hidden">Agregue prendas para ver las etiquetas.</p>
          ) : (
            <div id="printable-labels" className="grid grid-cols-3 gap-2 print:gap-[2mm]">
              {labels.map((l) => (
                <div
                  key={l.key}
                  className="label-cell bg-white border border-dashed border-slate-300 rounded-md px-2 py-1.5 text-black flex flex-col items-center text-center print:h-[33mm] print:rounded-none"
                >
                  <p className="text-[8px] uppercase tracking-wider text-slate-500 leading-none">{storeName}</p>
                  <p className="text-[10px] font-bold leading-tight mt-0.5 line-clamp-1 w-full">{l.name}</p>
                  {l.detail && <p className="text-[9px] leading-tight">{l.detail}</p>}
                  <p className="text-sm font-black leading-tight mt-0.5">
                    {formatNIO(l.price)}
                    {l.price < l.regularPrice && <span className="ml-1 text-[9px] font-normal line-through text-slate-500">{formatNIO(l.regularPrice)}</span>}
                  </p>
                  <Barcode value={l.skuCode} className="w-full h-8 mt-0.5" />
                  <p className="text-[9px] font-mono leading-none mt-0.5">{l.skuCode}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
