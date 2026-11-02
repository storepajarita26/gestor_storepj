'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Package, X } from 'lucide-react';
import { StockLevel } from '@/domain/inventory/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';

function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface BundleSkuSearchSelectProps {
  bundleStockList: StockLevel[];
  selectedBundleSku: string;
  onSelectBundleSku: (skuId: string) => void;
  disabled?: boolean;
}

export function BundleSkuSearchSelect({
  bundleStockList,
  selectedBundleSku,
  onSelectBundleSku,
  disabled = false,
}: BundleSkuSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pack actualmente seleccionado
  const selectedStock = useMemo(() => {
    return bundleStockList.find((s) => s.skuId === selectedBundleSku);
  }, [bundleStockList, selectedBundleSku]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
      // Auto-enfocar el input de búsqueda
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Filtrado flexible con límite de 50 ítems
  const { displayList, totalMatches } = useMemo(() => {
    const cleanQuery = normalizeText(searchTerm.trim());

    if (!cleanQuery) {
      // Sin búsqueda: mostrar los primeros 50
      return {
        displayList: bundleStockList.slice(0, 50),
        totalMatches: bundleStockList.length,
      };
    }

    const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);
    const matches: StockLevel[] = [];

    for (let i = 0; i < bundleStockList.length; i++) {
      const s = bundleStockList[i];
      const searchableString = normalizeText(
        [
          s.skuCode,
          s.skuDescription,
          s.productName,
          s.size,
          s.colorName,
        ]
          .filter(Boolean)
          .join(' ')
      );

      const matchesAllTokens = queryTokens.every((token) =>
        searchableString.includes(token)
      );

      if (matchesAllTokens) {
        matches.push(s);
      }
    }

    return {
      displayList: matches.slice(0, 50),
      totalMatches: matches.length,
    };
  }, [bundleStockList, searchTerm]);

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Botón Trigger Selector */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full bg-surface hover:bg-surface-soft border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss transition-colors flex items-center justify-between gap-2 shadow-2xs text-left ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${isOpen ? 'ring-2 ring-moss/30 border-moss' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedStock ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-xs font-bold text-moss bg-moss/10 px-2 py-0.5 rounded border border-moss/20 shrink-0">
              {selectedStock.skuCode}
            </span>
            <span className="text-xs font-semibold text-ink truncate">
              {selectedStock.skuDescription && selectedStock.skuDescription !== selectedStock.skuCode
                ? selectedStock.skuDescription
                : selectedStock.productName}
            </span>
            {selectedStock.size && (
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium shrink-0">
                Talla {selectedStock.size}
              </span>
            )}
            {selectedStock.colorName && (
              <span className="text-[10px] text-ink-muted shrink-0 hidden sm:inline">
                • {selectedStock.colorName}
              </span>
            )}
          </div>
        ) : (
          <span className="text-ink-muted text-xs flex items-center gap-1.5">
            <Package className="w-4 h-4 text-ink-muted" />
            -- Seleccionar SKU paquete a desempacar --
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {selectedStock && (
            <span className="text-[11px] font-bold text-ink-muted hidden sm:inline">
              Disp: <strong className="text-ink">{selectedStock.quantityAvailable}</strong> | Costo:{' '}
              <strong className="text-moss-800">{formatNIO(selectedStock.costPriceNio)}</strong>
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-ink-muted transition-transform duration-200 shrink-0 ${
              isOpen ? 'rotate-180 text-ink' : ''
            }`}
          />
        </div>
      </button>

      {/* Menú Desplegable Flotante */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-moss/20 rounded-2xl shadow-2xl ring-1 ring-moss/10 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
          {/* Barra de Búsqueda */}
          <div className="p-2.5 bg-surface-soft/80 border-b border-moss/10 space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código de pack, descripción o color..."
                className="w-full bg-white border border-moss/20 rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-moss"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5 rounded transition-colors"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-ink-muted px-0.5 font-medium">
              <span>
                {searchTerm.trim()
                  ? `Mostrando ${displayList.length} de ${totalMatches} coincidencia${
                      totalMatches === 1 ? '' : 's'
                    }`
                  : `Mostrando primeros ${displayList.length} de ${bundleStockList.length} packs`}
              </span>
              {bundleStockList.length > 50 && !searchTerm.trim() && (
                <span className="text-moss font-bold">Primeros 50</span>
              )}
            </div>
          </div>

          {/* Lista de Resultados */}
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
            {displayList.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-muted">
                No se encontraron paquetes con &ldquo;{searchTerm}&rdquo;.
              </div>
            ) : (
              displayList.map((s) => {
                const isSelected = s.skuId === selectedBundleSku;
                const label =
                  s.skuDescription && s.skuDescription !== s.skuCode
                    ? s.skuDescription
                    : s.productName;

                return (
                  <button
                    key={s.skuId}
                    type="button"
                    onClick={() => {
                      onSelectBundleSku(s.skuId);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-moss/10 text-moss font-semibold border border-moss/30'
                        : 'hover:bg-surface text-ink'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-moss">
                          {s.skuCode}
                        </span>
                        {s.size && (
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                            Talla {s.size}
                          </span>
                        )}
                        {s.colorName && (
                          <span className="text-[10px] text-ink-muted">
                            • {s.colorName}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-muted truncate mt-0.5">
                        {label}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="block text-xs font-bold text-ink">
                        Disp: {s.quantityAvailable}
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        Costo: {formatNIO(s.costPriceNio)}
                      </span>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-moss shrink-0 ml-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
