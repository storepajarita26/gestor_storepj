'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  Tag,
  Palette,
  Edit3,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  Layers,
  FolderTree,
  Plus,
} from 'lucide-react';
import { Product, ProductSku } from '@/domain/catalog/types';
import { StockLevel } from '@/domain/inventory/types';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface ProductCardProps {
  product: Product;
  stockMap: Record<string, StockLevel>;
  exchangeRate: number;
  onEditSku: (sku: ProductSku, product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onAddSku?: (product: Product) => void;
  /** false = vista pública: sin costos ni acciones de edición */
  canManage?: boolean;
}

export function ProductCard({
  product,
  stockMap,
  exchangeRate,
  onEditSku,
  onEditProduct,
  onDeleteProduct,
  onAddSku,
  canManage = true,
}: ProductCardProps) {
  // Variantes ordenadas por fecha de creación descendente
  const skus = useMemo(() => {
    return [...(product.skus || [])].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.skuCode || '').localeCompare(a.skuCode || '', undefined, { numeric: true });
    });
  }, [product.skus]);

  const [selectedSkuId, setSelectedSkuId] = useState<string>(skus[0]?.id || '');

  useEffect(() => {
    if (!skus.some((s) => s.id === selectedSkuId)) {
      setSelectedSkuId(skus[0]?.id || '');
    }
  }, [skus, selectedSkuId]);

  const currentSku = skus.find((s) => s.id === selectedSkuId) || skus[0];
  const currentStock = currentSku ? stockMap[currentSku.id] : undefined;

  const availableStock = currentStock?.quantityAvailable ?? 0;
  const reservedStock = currentStock?.quantityReserved ?? 0;

  // Main image priority: current SKU image -> first SKU with image -> fallback
  const displayImage =
    currentSku?.mainImageUrl ||
    skus.find((s) => s.mainImageUrl)?.mainImageUrl ||
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80';

  const isBundle = currentSku ? dataStore.isBundleSku(currentSku) : false;

  const handleToggleSkuType = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSku) return;
    const nextType = isBundle ? 'simple' : 'paquete';
    dataStore.updateSku({
      ...currentSku,
      skuType: nextType,
    });
  };

  return (
    <div className="erp-card rounded-2xl overflow-hidden border border-moss/15 flex flex-col justify-between hover:shadow-lg transition-all duration-200 bg-white group/card">
      <div>
        {/* Product Visual & Header Image */}
        <div className="relative h-52 w-full bg-surface-soft overflow-hidden group">
          <img
            src={displayImage}
            alt={product.name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80';
            }}
          />

          {/* Sombra sutil para mejorar legibilidad de badges */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/35 pointer-events-none" />

          {/* Barra Superior: Categoría Principal (Izquierda) y Tipo de SKU seleccionado (Derecha) */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2 pointer-events-none">
            <span
              className="bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm border border-white/10 truncate max-w-[65%]"
              title={product.categoryName || 'General'}
            >
              {product.categoryName || 'General'}
            </span>

            {currentSku && (
              <button
                type="button"
                onClick={canManage ? handleToggleSkuType : undefined}
                disabled={!canManage}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm shrink-0 backdrop-blur-md pointer-events-auto transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer disabled:cursor-default disabled:hover:scale-100 disabled:active:scale-100 flex items-center gap-1 ${
                  isBundle
                    ? 'bg-purple-900/90 text-purple-200 border border-purple-400/30 hover:bg-purple-800'
                    : 'bg-sky-900/90 text-sky-200 border border-sky-400/30 hover:bg-sky-800'
                }`}
                title={
                  canManage
                    ? `SKU ${currentSku.skuCode}: clic para cambiar tipo a ${isBundle ? 'Simple' : 'Paquete / Pack'}`
                    : undefined
                }
              >
                <span>{isBundle ? 'SKU Pack' : 'SKU Simple'}</span>
                {canManage && <span className="text-[9px] opacity-70">⇅</span>}
              </button>
            )}
          </div>

          {/* Barra Inferior: Subcategoría (Izquierda) y Nivel de Existencia (Derecha) */}
          <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-2 pointer-events-none">
            {product.subcategoryName ? (
              <span
                className="bg-white/95 backdrop-blur-md text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm border border-black/10 truncate max-w-[55%]"
                title={product.subcategoryName}
              >
                {product.subcategoryName}
              </span>
            ) : (
              <span />
            )}

            <div className="bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg border border-black/10 shadow-sm flex items-center gap-1.5 text-[11px] font-bold text-ink shrink-0 ml-auto">
              <span
                className={`w-2 h-2 rounded-full ${
                  availableStock > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <span>{availableStock} disp.</span>
              {reservedStock > 0 && (
                <span className="text-[10px] text-amber-700 font-normal">({reservedStock})</span>
              )}
            </div>
          </div>
        </div>

        {/* Info Content */}
        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              {product.productCode ? (
                <span className="font-mono text-[11px] font-extrabold text-moss bg-moss/10 px-2 py-0.5 rounded border border-moss/20">
                  {product.productCode}
                </span>
              ) : (
                <span />
              )}
              {product.createdAt && (
                <span
                  className="text-[10px] text-ink-muted/80 font-medium"
                  title={`Fecha de creación: ${new Date(product.createdAt).toLocaleString('es-NI')}`}
                >
                  {new Date(product.createdAt).toLocaleDateString('es-NI', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
            <h3 className="font-bold text-ink text-sm leading-snug line-clamp-1" title={product.name}>
              {product.name}
            </h3>
          </div>

          {/* Variant Selector Pills */}
          {skus.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-moss/10">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-ink-muted font-medium">Variantes ({skus.length}):</span>
                {canManage && onAddSku && (
                  <button
                    type="button"
                    onClick={() => onAddSku(product)}
                    className="flex items-center gap-0.5 text-[10px] font-bold text-moss hover:text-moss-700 bg-moss/10 hover:bg-moss/20 px-1.5 py-0.5 rounded transition-colors"
                    title="Crear nueva variante SKU para este producto"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>SKU</span>
                  </button>
                )}
              </div>
              {currentSku && (
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="font-bold text-moss">{currentSku.skuCode}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        currentSku.isActive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                      }`}
                    >
                      {currentSku.isActive ? '● Activo' : '○ Inactivo'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                {skus.map((s) => {
                  const isSelected = (currentSku?.id || skus[0]?.id) === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSkuId(s.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-moss text-white shadow-xs scale-102'
                          : 'bg-surface border border-moss/15 text-ink hover:bg-eggshell-100'
                      } ${!s.isActive ? 'opacity-55 ring-1 ring-rose-300/60' : ''}`}
                      title={`${s.skuCode} - ${s.size || 'Única'} - ${s.colorName || 'Color'} (${s.isActive ? 'Activo' : 'Inactivo'})`}
                    >
                      {s.colorHex && (
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: s.colorHex }}
                        />
                      )}
                      <span>{s.size || 'U'}</span>
                      {!s.isActive && <span className="text-[8px] text-rose-500 font-extrabold ml-0.5">✕</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price & Landed Cost Breakdown */}
          {currentSku && (
            <div className="bg-surface-soft/60 p-2.5 rounded-xl border border-moss/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-ink-muted block font-medium">Precio Venta</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-extrabold text-sm text-moss">
                    {formatNIO(currentSku.salePriceNio)}
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    ({formatUSD(currentSku.salePriceNio / exchangeRate)})
                  </span>
                </div>
              </div>

              {canManage && (
                <div className="text-right">
                  <span className="text-[10px] text-ink-muted block font-medium">Costo Landed</span>
                  <span className="font-mono text-xs font-bold text-ink-muted">
                    {formatNIO(currentSku.costPriceNio)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card Footer Actions (solo administración) */}
      {canManage && (
      <div className="p-3 bg-surface-soft/40 border-t border-moss/10 flex flex-col gap-2">
        {currentSku ? (
          <button
            onClick={() => onEditSku(currentSku, product)}
            className="w-full h-8.5 flex items-center justify-center gap-1.5 bg-moss/10 hover:bg-moss text-moss hover:text-white border border-moss/20 px-3 rounded-xl text-xs font-bold transition-all shadow-xs"
            title="Modificar precio, color, talla, costo o código de este SKU"
          >
            <Edit3 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Editar SKU ({currentSku.size || 'U'})</span>
          </button>
        ) : (
          <div className="w-full h-8.5 flex items-center justify-center text-xs text-ink-muted italic bg-white/60 rounded-xl border border-moss/10">
            Sin variantes
          </div>
        )}

        <div className="flex items-center gap-2">
          {onEditProduct && (
            <button
              onClick={() => onEditProduct(product)}
              className="flex-1 h-8 flex items-center justify-center gap-1.5 bg-white hover:bg-surface-soft text-ink border border-moss/20 px-3 rounded-xl text-xs font-semibold transition-all shadow-xs"
              title="Editar datos generales del producto (nombre, categoría, tipo)"
            >
              <FolderTree className="w-3.5 h-3.5 text-moss shrink-0" />
              <span className="truncate">Editar Producto</span>
            </button>
          )}

          <button
            onClick={() => onDeleteProduct(product.id)}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-rose-500 hover:text-white hover:bg-rose-600 border border-rose-200/80 hover:border-rose-600 transition-all shadow-xs bg-white"
            title="Eliminar producto completo"
              aria-label={`Eliminar ${product.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
