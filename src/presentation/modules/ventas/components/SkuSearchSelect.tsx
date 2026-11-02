'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Package, X } from 'lucide-react';
import { StockLevel } from '@/domain/inventory/types';
import { Product } from '@/domain/catalog/types';

// Función para remover acentos y caracteres especiales para búsqueda flexible
function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface SkuSearchSelectProps {
  stockList: StockLevel[];
  products?: Product[];
  selectedSkuId: string;
  onSelectSku: (skuId: string) => void;
}

export function SkuSearchSelect({ stockList, products = [], selectedSkuId, onSelectSku }: SkuSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Mapa de productos por ID para búsqueda rápida en descripción de producto
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      map.set(p.id, p);
      (p.skus || []).forEach((sku) => {
        map.set(sku.id, p);
      });
    });
    return map;
  }, [products]);

  const selectedStock = useMemo(() => {
    return stockList.find((s) => s.skuId === selectedSkuId);
  }, [stockList, selectedSkuId]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrado flexible y sin sensibilidad a acentos / mayúsculas
  const filteredSkus = useMemo(() => {
    if (!searchTerm.trim()) {
      return stockList.slice(0, 20);
    }

    const query = normalizeText(searchTerm.trim());
    const queryTokens = query.split(/\s+/).filter(Boolean);
    const results: StockLevel[] = [];

    for (let i = 0; i < stockList.length; i++) {
      const s = stockList[i];
      const parentProd = productMap.get(s.skuId);

      // Concatenar todos los campos buscables
      const searchableString = normalizeText([
        s.skuId,
        s.skuCode,
        s.productName,
        s.skuDescription,
        s.colorName,
        s.size,
        parentProd?.name,
        parentProd?.productCode,
        parentProd?.description,
        parentProd?.seoDescription,
        parentProd?.categoryName,
        parentProd?.subcategoryName,
      ].filter(Boolean).join(' '));

      // Verificar que todos los términos de búsqueda coincidan (búsqueda multicriterio)
      const matchesAllTokens = queryTokens.every((token) => searchableString.includes(token));

      if (matchesAllTokens) {
        results.push(s);
        if (results.length >= 30) break; // Límite óptimo de 30 para fluidez máxima
      }
    }
    return results;
  }, [stockList, searchTerm, productMap]);


  return (
    <div className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`} ref={containerRef}>
      {/* Botón trigger con miniatura */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white hover:bg-slate-50 border border-moss/20 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-left transition-all shadow-xs gap-2 group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Miniatura */}
          <div className="w-8 h-8 rounded-lg bg-surface border border-moss/10 overflow-hidden shrink-0 flex items-center justify-center">
            {selectedStock?.mainImageUrl ? (
              <img
                src={selectedStock.mainImageUrl}
                alt={selectedStock.skuCode}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Package className="w-4 h-4 text-ink-muted/50" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="font-bold text-xs text-ink truncate font-mono">
                {selectedStock?.skuCode || 'Seleccionar SKU'}
              </span>
              {selectedStock?.size && (
                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold shrink-0">
                  {selectedStock.size}
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-muted truncate leading-tight">
              {selectedStock?.productName || 'Haga clic para buscar...'}
              {selectedStock?.colorName ? ` - ${selectedStock.colorName}` : ''}
              {selectedStock !== undefined
                ? ` • Disp: ${Math.max(0, selectedStock.quantityAvailable - (selectedStock.quantityReserved || 0))}`
                : ''}
            </p>
          </div>
        </div>

        <ChevronDown className="w-4 h-4 text-ink-muted group-hover:text-ink shrink-0 transition-transform duration-200" />
      </button>

      {/* Menú flotante desplegable */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[320px] sm:min-w-[420px] max-w-lg bg-white border border-moss/20 rounded-2xl shadow-2xl ring-1 ring-moss/10 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
          {/* Barra de Búsqueda */}
          <div className="p-2 border-b border-moss/10 bg-surface/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código, nombre, talla o color..."
                className="w-full bg-white border border-moss/20 rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-moss"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1 text-[10px] text-ink-muted">
              <span>{searchTerm.trim() ? `Mostrando hasta ${filteredSkus.length} coincidencias` : 'Mostrando primeros 20 SKUs'}</span>
              <span>Total en stock: {stockList.length}</span>
            </div>
          </div>

          {/* Lista de SKUs con miniaturas */}
          <div className="max-h-60 overflow-y-auto p-1 space-y-1 custom-scrollbar">
            {filteredSkus.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-muted">
                No se encontraron variantes con "{searchTerm}".
              </div>
            ) : (
              filteredSkus.map((sku) => {
                const isSelected = sku.skuId === selectedSkuId;
                return (
                  <button
                    key={sku.skuId}
                    type="button"
                    onClick={() => {
                      onSelectSku(sku.skuId);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-moss/10 text-moss font-semibold'
                        : 'hover:bg-surface text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Thumbnail */}
                      <div className="w-9 h-9 rounded-lg bg-surface border border-moss/10 overflow-hidden shrink-0 flex items-center justify-center">
                        {sku.mainImageUrl ? (
                          <img
                            src={sku.mainImageUrl}
                            alt={sku.skuCode}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="w-4 h-4 text-ink-muted/50" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold truncate">
                            {sku.skuCode}
                          </span>
                          {sku.size && (
                            <span className="text-[9px] bg-slate-100 text-slate-700 px-1 py-0.2 rounded font-medium">
                              Talla {sku.size}
                            </span>
                          )}
                          {sku.colorName && (
                            <span className="text-[9px] text-ink-muted">
                              • {sku.colorName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-muted truncate">
                          {sku.productName}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="block text-[11px] font-bold text-moss">
                        C$ {sku.salePriceNio.toFixed(2)}
                      </span>
                      {/* Disponible para vender = existencia física menos lo apartado para pedidos */}
                      <span className="text-[10px] text-ink-muted">
                        Disp: {Math.max(0, sku.quantityAvailable - (sku.quantityReserved || 0))}
                        {(sku.quantityReserved || 0) > 0 ? ` (${sku.quantityReserved} apart.)` : ''}
                      </span>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-moss shrink-0 ml-1" />}
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
