'use client';

import React from 'react';
import { Search, Plus, Download, Receipt, X } from 'lucide-react';
import { DeliveryStatus } from '@/domain/sales/types';

interface SalesFiltersBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  deliveryFilter: 'todos' | DeliveryStatus;
  onDeliveryFilterChange: (status: 'todos' | DeliveryStatus) => void;
  onOpenNewSale: () => void;
  onExportInvoices: () => void;
}

const DELIVERY_OPTIONS: { label: string; value: 'todos' | DeliveryStatus }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'En Tránsito', value: 'en_transito' },
  { label: 'Listos Entrega', value: 'listo_entrega' },
  { label: 'Entregados', value: 'entregado' },
];

export function SalesFiltersBar({
  searchTerm,
  onSearchChange,
  deliveryFilter,
  onDeliveryFilterChange,
  onOpenNewSale,
  onExportInvoices,
}: SalesFiltersBarProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">

        <div className="flex items-center gap-2.5">
          <button
            onClick={onExportInvoices}
            className="flex items-center gap-1.5 bg-white hover:bg-surface border border-moss/20 text-ink text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
            title="Descargar reporte de ventas en Excel CSV"
          >
            <Download className="w-4 h-4 text-moss" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>

          <button
            onClick={onOpenNewSale}
            className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-moss/20"
          >
            <Plus className="w-4 h-4 text-mustard" />
            <span>Nueva venta</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="erp-card p-3 sm:p-4 border border-moss/15 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        {/* Delivery Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
          {DELIVERY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDeliveryFilterChange(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                deliveryFilter === opt.value
                  ? 'bg-moss text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar factura, cliente, guía..."
            className="w-full bg-surface border border-moss/15 rounded-xl pl-9 pr-8 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-moss"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
