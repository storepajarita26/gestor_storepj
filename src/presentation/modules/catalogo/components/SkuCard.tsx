'use client';

import React from 'react';
import { Edit3, FolderTree, Trash2 } from 'lucide-react';
import { Product, ProductSku } from '@/domain/catalog/types';
import { StockLevel } from '@/domain/inventory/types';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface SkuCardProps {
  sku: ProductSku;
  product: Product;
  stockLevel?: StockLevel;
  exchangeRate: number;
  onEditSku: (sku: ProductSku, product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct?: (productId: string) => void;
  /** false = vista pública: sin costos ni acciones de edición */
  canManage?: boolean;
}

export function SkuCard({
  sku,
  product,
  stockLevel,
  exchangeRate,
  onEditSku,
  onEditProduct,
  onDeleteProduct,
  canManage = true,
}: SkuCardProps) {
  const availableStock = stockLevel?.quantityAvailable ?? 0;
  const reservedStock = stockLevel?.quantityReserved ?? 0;

  const displayImage =
    sku.mainImageUrl ||
    product.skus?.find((s) => s.mainImageUrl)?.mainImageUrl ||
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80';

  const isBundle = dataStore.isBundleSku(sku);

  const handleToggleSkuType = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextType = isBundle ? 'simple' : 'paquete';
    dataStore.updateSku({
      ...sku,
      skuType: nextType,
    });
  };

  return (
    <div className="erp-card rounded-2xl overflow-hidden border border-moss/15 flex flex-col justify-between hover:shadow-lg transition-all duration-200 bg-white group/card">
      <div>
        {/* SKU Visual & Header Image */}
        <div className="relative h-52 w-full bg-surface-soft overflow-hidden group">
          <img
            src={displayImage}
            alt={sku.skuDescription || sku.skuCode}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80';
            }}
          />

          {/* Sombra sutil para mejorar legibilidad de badges */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/35 pointer-events-none" />

          {/* Barra Superior: Categoría (Izquierda) y Tipo de SKU (Derecha) */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2 pointer-events-none">
            <span
              className="bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm border border-white/10 truncate max-w-[65%]"
              title={product.categoryName || 'General'}
            >
              {product.categoryName || 'General'}
            </span>

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
                  ? `SKU ${sku.skuCode}: clic para cambiar tipo a ${isBundle ? 'Simple' : 'Paquete / Pack'}`
                  : undefined
              }
            >
              <span>{isBundle ? 'SKU Pack' : 'SKU Simple'}</span>
              {canManage && <span className="text-[9px] opacity-70">⇅</span>}
            </button>
          </div>

          {/* Barra Inferior: Talla & Color (Izquierda) y Nivel de Existencia (Derecha) */}
          <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-2 pointer-events-none">
            <div className="bg-white/95 backdrop-blur-md text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm border border-black/10 flex items-center gap-1.5 truncate max-w-[60%]">
              {sku.colorHex && (
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/25 shrink-0"
                  style={{ backgroundColor: sku.colorHex }}
                />
              )}
              <span className="truncate">Talla {sku.size || 'U'}</span>
              {sku.colorName && <span className="text-ink-muted truncate">• {sku.colorName}</span>}
            </div>

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
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="font-mono text-xs font-extrabold text-moss bg-moss/10 px-2 py-0.5 rounded border border-moss/20 shrink-0">
                  {sku.skuCode}
                </span>
                {product.productCode && (
                  <span className="font-mono text-[10px] text-ink-muted bg-surface-soft px-1.5 py-0.5 rounded border border-moss/10 shrink-0" title={`Pertenece al producto ${product.productCode}`}>
                    {product.productCode}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(sku.createdAt || product.createdAt) && (
                  <span
                    className="text-[10px] text-ink-muted/80 font-medium"
                    title={`Fecha de creación: ${new Date(sku.createdAt || product.createdAt!).toLocaleString('es-NI')}`}
                  >
                    {new Date(sku.createdAt || product.createdAt!).toLocaleDateString('es-NI', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
                <span className={`text-[10px] font-bold ${sku.isActive ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {sku.isActive ? '● Activo' : '○ Inactivo'}
                </span>
              </div>
            </div>

            <h3 className="font-bold text-ink text-sm leading-snug line-clamp-1" title={product.name}>
              {product.name}
            </h3>

            {sku.skuDescription && sku.skuDescription !== sku.skuCode && (
              <p className="text-[11px] text-ink-muted line-clamp-1 mt-0.5" title={sku.skuDescription}>
                {sku.skuDescription}
              </p>
            )}
          </div>

          {/* Price & Landed Cost Breakdown */}
          <div className="bg-surface-soft/60 p-2.5 rounded-xl border border-moss/10 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-ink-muted block font-medium">Precio Venta</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-sm text-moss">
                  {formatNIO(sku.salePriceNio)}
                </span>
                <span className="text-[10px] text-ink-muted">
                  ({formatUSD(sku.salePriceNio / exchangeRate)})
                </span>
              </div>
            </div>

            {canManage && (
              <div className="text-right">
                <span className="text-[10px] text-ink-muted block font-medium">Costo Landed</span>
                <span className="font-mono text-xs font-bold text-ink-muted">
                  {formatNIO(sku.costPriceNio)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer Actions (solo administración) */}
      {canManage && (
      <div className="p-3 bg-surface-soft/40 border-t border-moss/10 flex flex-col gap-2">
        <button
          onClick={() => onEditSku(sku, product)}
          className="w-full h-8.5 flex items-center justify-center gap-1.5 bg-moss/10 hover:bg-moss text-moss hover:text-white border border-moss/20 px-3 rounded-xl text-xs font-bold transition-all shadow-xs"
          title="Editar precio, costos y detalles de este SKU"
        >
          <Edit3 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Editar SKU ({sku.size || 'U'})</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEditProduct(product)}
            className="flex-1 h-8 flex items-center justify-center gap-1.5 bg-white hover:bg-surface-soft text-ink border border-moss/20 px-3 rounded-xl text-xs font-semibold transition-all shadow-xs"
            title="Editar datos generales del producto padre"
          >
            <FolderTree className="w-3.5 h-3.5 text-moss shrink-0" />
            <span className="truncate">Editar Producto</span>
          </button>

          {onDeleteProduct && (
            <button
              onClick={() => onDeleteProduct(product.id)}
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-rose-500 hover:text-white hover:bg-rose-600 border border-rose-200/80 hover:border-rose-600 transition-all shadow-xs bg-white"
              title="Eliminar producto completo"
              aria-label={`Eliminar ${product.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
